import axios from 'axios';
import http from 'http';
import https from 'https';
import Parser from 'rss-parser';
import { createLogger } from '../utils/logger.js';
import {
  retryWithBackoff,
  sanitizeError,
  delay,
  extractInstagramPostId
} from '../utils/helpers.js';
import {
  HTTP_TIMEOUT_MS,
  HTTP_KEEP_ALIVE_MAX_SOCKETS,
  STRATEGY_DELAY_MS,
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BASE_DELAY_MS,
  FETCH_RETRY_MAX_DELAY_MS,
  INSTAGRAM_API_URL,
  INSTAGRAM_WEB_APP_ID,
  BIBLIOGRAM_INSTANCES
} from '../utils/constants.js';
import metrics from '../utils/metrics.js';

const logger = createLogger('Instagram');

/**
 * Instagram Service
 * Handles fetching posts from Instagram using multiple strategies
 */
class InstagramService {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ['media:content', 'description', 'guid']
      }
    });
    this.rssBridgeUrl = process.env.RSS_BRIDGE_URL || 'https://rss-bridge.org/bridge01';

    // Create HTTP client with realistic browser headers and connection pooling
    this.httpClient = axios.create({
      timeout: HTTP_TIMEOUT_MS,
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: HTTP_KEEP_ALIVE_MAX_SOCKETS
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: HTTP_KEEP_ALIVE_MAX_SOCKETS
      }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });

    // Track last successful method per account for faster checks
    this.lastSuccessfulMethod = new Map();
  }

  /**
   * Fetch recent posts from an Instagram account using RSS Bridge
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchPostsViaRSSBridge(username) {
    return retryWithBackoff(
      async () => {
        const url = `${this.rssBridgeUrl}/?action=display&bridge=Instagram&context=Username&u=${username}&media_type=all&format=Atom`;

        logger.debug(`Fetching posts for @${username} via RSS Bridge`, { username, url });

        const response = await this.httpClient.get(url);
        const feed = await this.parser.parseString(response.data);

        if (!feed.items || feed.items.length === 0) {
          logger.debug(`No posts found for @${username}`, { username });
          return [];
        }

        const posts = feed.items
          .map(item => {
            const postId = extractInstagramPostId(item.link || item.guid);

            return {
              id: postId,
              url: item.link,
              title: item.title || '',
              description: item.contentSnippet || item.description || '',
              publishedAt: new Date(item.pubDate || item.isoDate),
              thumbnail: item['media:content']?.$?.url || null
            };
          })
          .sort((a, b) => b.publishedAt - a.publishedAt);

        return posts;
      },
      FETCH_RETRY_ATTEMPTS,
      FETCH_RETRY_BASE_DELAY_MS,
      FETCH_RETRY_MAX_DELAY_MS,
      (error) => {
        // Retry on network errors, not on 4xx errors
        return !error.response || error.response.status >= 500;
      }
    ).catch(error => {
      logger.warn(`RSS Bridge unavailable for @${username}: ${error.message}`, { username });
      return [];
    });
  }

  /**
   * Fallback: Try to fetch using Bibliogram instances (community-run Instagram frontend)
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchPostsViaBibliogram(username) {
    for (const instance of BIBLIOGRAM_INSTANCES) {
      try {
        logger.debug(`Trying Bibliogram instance: ${instance} for @${username}`, {
          username,
          instance
        });

        const url = `${instance}/u/${username}/rss.xml`;
        const response = await this.httpClient.get(url);
        const feed = await this.parser.parseString(response.data);

        if (feed.items && feed.items.length > 0) {
          const posts = feed.items
            .map(item => {
              const postId = extractInstagramPostId(item.link || item.guid);
              return {
                id: postId,
                url: item.link.replace(instance, 'https://www.instagram.com'),
                title: item.title || '',
                description: item.contentSnippet || '',
                publishedAt: new Date(item.pubDate || item.isoDate),
                thumbnail: null
              };
            })
            .sort((a, b) => b.publishedAt - a.publishedAt);

          logger.info(`Successfully fetched ${posts.length} posts via Bibliogram`, {
            username,
            instance,
            postCount: posts.length
          });
          return posts;
        }
      } catch (error) {
        logger.debug(`Bibliogram instance ${instance} failed`, {
          username,
          instance,
          error: sanitizeError(error)
        });
        continue;
      }
    }

    return [];
  }

  /**
   * Method 3: Scrape Instagram's HTML page (real-time data)
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchPostsViaWebScrape(username) {
    return retryWithBackoff(
      async () => {
        logger.debug(`Attempting web scrape for @${username}`, { username });

        const url = `https://www.instagram.com/${username}/`;
        const response = await this.httpClient.get(url);

        const html = response.data;

        // Method 1: Try to extract from window._sharedData (legacy method)
        const sharedDataMatch = html.match(/window\._sharedData = ({.+?});<\/script>/);
        if (sharedDataMatch) {
          try {
            const sharedData = JSON.parse(sharedDataMatch[1]);
            const userData = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;

            if (userData?.edge_owner_to_timeline_media?.edges) {
              const posts = userData.edge_owner_to_timeline_media.edges
                .slice(0, 12)
                .map(edge => {
                  const node = edge.node;
                  return {
                    id: node.shortcode,
                    url: `https://www.instagram.com/p/${node.shortcode}/`,
                    title: '',
                    description: node.edge_media_to_caption?.edges[0]?.node?.text || '',
                    publishedAt: new Date(node.taken_at_timestamp * 1000),
                    thumbnail: node.thumbnail_src || node.display_url,
                    isPinned: node.pinned_for_users && node.pinned_for_users.length > 0
                  };
                })
                .sort((a, b) => b.publishedAt - a.publishedAt);

              logger.info(`Successfully scraped ${posts.length} posts via _sharedData`, {
                username,
                postCount: posts.length
              });
              return posts;
            }
          } catch (e) {
            logger.debug('Failed to parse _sharedData, trying alternative method', { username });
          }
        }

        // Method 2: Try to extract from script tags with type="application/ld+json"
        const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gs);
        for (const match of jsonLdMatches) {
          try {
            const data = JSON.parse(match[1]);
            if (data['@type'] === 'ProfilePage' && data.mainEntity) {
              // This might contain basic profile info but not posts
              logger.debug('Found JSON-LD data but no post information', { username });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }

        // Method 3: Try extracting shortcodes from HTML (last resort)
        const shortcodeMatches = html.matchAll(/\/p\/([A-Za-z0-9_-]+)\//g);
        if (shortcodeMatches) {
          const shortcodes = new Set();
          for (const match of shortcodeMatches) {
            shortcodes.add(match[1]);
            if (shortcodes.size >= 12) break;
          }

          if (shortcodes.size > 0) {
            const posts = Array.from(shortcodes).map(shortcode => ({
              id: shortcode,
              url: `https://www.instagram.com/p/${shortcode}/`,
              title: '',
              description: '',
              publishedAt: new Date(), // No timestamp available
              thumbnail: null
            }));

            logger.info(`Scraped ${posts.length} post URLs (limited metadata)`, {
              username,
              postCount: posts.length
            });
            return posts;
          }
        }

        logger.warn(`Could not extract posts from web page for @${username}`, { username });
        return [];
      },
      FETCH_RETRY_ATTEMPTS,
      FETCH_RETRY_BASE_DELAY_MS,
      FETCH_RETRY_MAX_DELAY_MS,
      (error) => !error.response || error.response.status >= 500
    ).catch(error => {
      logger.error(`Web scrape error for @${username}`, {
        username,
        error: sanitizeError(error)
      });
      return [];
    });
  }

  /**
   * Method 4: Try direct Instagram public API endpoint (may be rate limited)
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchPostsViaDirect(username) {
    return retryWithBackoff(
      async () => {
        logger.debug(`Attempting direct API fetch for @${username}`, { username });

        const url = `${INSTAGRAM_API_URL}/users/web_profile_info/?username=${username}`;

        const response = await this.httpClient.get(url, {
          headers: {
            'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        const userData = response.data?.data?.user;
        if (!userData?.edge_owner_to_timeline_media?.edges) {
          return [];
        }

        const posts = userData.edge_owner_to_timeline_media.edges
          .slice(0, 12)
          .map(edge => {
            const node = edge.node;
            return {
              id: node.shortcode,
              url: `https://www.instagram.com/p/${node.shortcode}/`,
              title: '',
              description: node.edge_media_to_caption?.edges[0]?.node?.text || '',
              publishedAt: new Date(node.taken_at_timestamp * 1000),
              thumbnail: node.thumbnail_src || node.display_url,
              isPinned: node.pinned_for_users && node.pinned_for_users.length > 0
            };
          })
          .sort((a, b) => b.publishedAt - a.publishedAt);

        const pinnedCount = posts.filter(p => p.isPinned).length;
        if (pinnedCount > 0) {
          logger.debug(`Found ${pinnedCount} pinned post(s) for @${username}`, {
            username,
            pinnedCount
          });
        }

        logger.info(`Successfully fetched ${posts.length} posts via direct API`, {
          username,
          postCount: posts.length
        });
        return posts;
      },
      FETCH_RETRY_ATTEMPTS,
      FETCH_RETRY_BASE_DELAY_MS,
      FETCH_RETRY_MAX_DELAY_MS,
      (error) => !error.response || error.response.status >= 500
    ).catch(error => {
      logger.error(`Direct API error for @${username}`, {
        username,
        error: sanitizeError(error)
      });
      return [];
    });
  }

  /**
   * Main method: Fetch posts using RSS Bridge (most reliable method)
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchRecentPosts(username) {
    const startTime = Date.now();
    metrics.recordFetchAttempt(username);

    logger.debug(`Fetching posts for @${username}`, { username });

    try {
      const posts = await this.fetchPostsViaRSSBridge(username);

      if (posts.length === 0) {
        logger.warn(`No posts found for @${username}`, { username });
        metrics.recordFetchFailure(username);
        return [];
      }

      const duration = Date.now() - startTime;
      metrics.recordFetchSuccess(username, 'RSS Bridge', duration);

      logger.info(`Found ${posts.length} posts for @${username}`, {
        username,
        postCount: posts.length,
        latestPost: posts[0].id
      });

      return posts;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Failed to fetch posts for @${username}`, {
        username,
        error: error.message,
        duration
      });
      metrics.recordFetchFailure(username);
      return [];
    }
  }

  /**
   * Extract post ID from Instagram URL or guid (deprecated - moved to helpers)
   * @deprecated Use extractInstagramPostId from helpers instead
   * @param {string} urlOrGuid - URL or GUID string
   * @returns {string|null} Post ID
   */
  extractPostId(urlOrGuid) {
    return extractInstagramPostId(urlOrGuid);
  }

  /**
   * Get the most recent post for an account
   * @param {string} username - Instagram username
   * @returns {Promise<Object|null>} Latest post or null
   */
  async getLatestPost(username) {
    const posts = await this.fetchRecentPosts(username);
    return posts.length > 0 ? posts[0] : null;
  }
}

export default InstagramService;
