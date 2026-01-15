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

        logger.info(`Found ${posts.length} posts for @${username} via RSS Bridge`, {
          username,
          postCount: posts.length
        });
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
      logger.error(`RSS Bridge error for @${username}`, {
        username,
        error: sanitizeError(error)
      });
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

        // Try to extract from window._sharedData (primary method)
        const sharedDataMatch = html.match(/window\._sharedData = ({.+?});<\/script>/);
        if (sharedDataMatch) {
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

            const pinnedCount = posts.filter(p => p.isPinned).length;
            if (pinnedCount > 0) {
              logger.debug(`Found ${pinnedCount} pinned post(s) for @${username}`, {
                username,
                pinnedCount
              });
            }

            logger.info(`Successfully scraped ${posts.length} posts from web page`, {
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
   * Main method: Try multiple strategies to fetch posts (ordered by reliability and speed)
   * @param {string} username - Instagram username
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchRecentPosts(username) {
    const startTime = Date.now();
    metrics.recordFetchAttempt(username);

    // Strategy order (best to worst for real-time data):
    // 1. Direct API (fastest, real-time, but rate limited)
    // 2. Web scrape (reliable, real-time, harder to block)
    // 3. RSS Bridge (slow, cached 15-60min, but stable)

    // Try last successful method first if we have one
    const lastMethod = this.lastSuccessfulMethod.get(username);

    let strategies = [
      { name: 'Direct API', fn: () => this.fetchPostsViaDirect(username) },
      { name: 'Web Scrape', fn: () => this.fetchPostsViaWebScrape(username) },
      { name: 'RSS Bridge', fn: () => this.fetchPostsViaRSSBridge(username) }
    ];

    // Reorder to try last successful method first
    if (lastMethod) {
      const lastMethodStrategy = strategies.find(s => s.name === lastMethod);
      if (lastMethodStrategy) {
        strategies = [
          lastMethodStrategy,
          ...strategies.filter(s => s.name !== lastMethod)
        ];
        logger.debug(`Trying last successful method first: ${lastMethod}`, {
          username,
          lastMethod
        });
      }
    }

    // Try multiple methods and combine results for better reliability
    const allPosts = [];
    const successfulMethods = [];

    for (const strategy of strategies) {
      try {
        const posts = await strategy.fn();
        if (posts.length > 0) {
          logger.info(`✓ ${strategy.name} returned ${posts.length} posts for @${username}`, {
            username,
            method: strategy.name,
            postCount: posts.length
          });

          allPosts.push(...posts);
          successfulMethods.push(strategy.name);
          metrics.recordFetchMethodSuccess(strategy.name, 1);

          // Update last successful method
          this.lastSuccessfulMethod.set(username, strategy.name);
        }

        // Add small delay between attempts
        await delay(STRATEGY_DELAY_MS);
      } catch (error) {
        logger.error(`✗ ${strategy.name} failed`, {
          username,
          method: strategy.name,
          error: sanitizeError(error)
        });
      }
    }

    if (allPosts.length === 0) {
      logger.warn(`✗ All methods failed for @${username}`, { username });
      metrics.recordFetchFailure(username);
      return [];
    }

    // Deduplicate posts by ID and sort by timestamp
    const uniquePosts = Array.from(
      new Map(allPosts.map(post => [post.id, post])).values()
    ).sort((a, b) => b.publishedAt - a.publishedAt);

    const duration = Date.now() - startTime;
    metrics.recordFetchSuccess(username, successfulMethods[0], duration);

    logger.info(`✓ Combined results: ${uniquePosts.length} unique posts from ${successfulMethods.join(', ')}`, {
      username,
      uniquePostCount: uniquePosts.length,
      methods: successfulMethods,
      duration
    });

    logger.debug(`Latest post: ${uniquePosts[0].id}`, {
      username,
      postId: uniquePosts[0].id,
      publishedAt: uniquePosts[0].publishedAt.toISOString()
    });

    return uniquePosts;
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
