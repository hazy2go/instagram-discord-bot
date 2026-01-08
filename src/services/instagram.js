import axios from 'axios';
import Parser from 'rss-parser';

class InstagramService {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ['media:content', 'description', 'guid']
      }
    });
    this.rssBridgeUrl = process.env.RSS_BRIDGE_URL || 'https://rss-bridge.org/bridge01';

    // Create HTTP client with realistic browser headers
    this.httpClient = axios.create({
      timeout: 20000,
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
   */
  async fetchPostsViaRSSBridge(username) {
    try {
      const url = `${this.rssBridgeUrl}/?action=display&bridge=Instagram&context=Username&u=${username}&media_type=all&format=Atom`;

      console.log(`[Instagram] Fetching posts for @${username} via RSS Bridge...`);

      const response = await this.httpClient.get(url);
      const feed = await this.parser.parseString(response.data);

      if (!feed.items || feed.items.length === 0) {
        console.log(`[Instagram] No posts found for @${username}`);
        return [];
      }

      const posts = feed.items.map(item => {
        // Extract post ID from link or guid
        const postId = this.extractPostId(item.link || item.guid);

        return {
          id: postId,
          url: item.link,
          title: item.title || '',
          description: item.contentSnippet || item.description || '',
          publishedAt: new Date(item.pubDate || item.isoDate),
          thumbnail: item['media:content']?.$?.url || null
        };
      });

      console.log(`[Instagram] Found ${posts.length} posts for @${username}`);
      return posts;

    } catch (error) {
      console.error(`[Instagram] RSS Bridge error for @${username}:`, error.message);
      return [];
    }
  }

  /**
   * Fallback: Try to fetch using Bibliogram instances (community-run Instagram frontend)
   */
  async fetchPostsViaBibliogram(username) {
    const bibliogramInstances = [
      'https://bibliogram.art',
      'https://bibliogram.snopyta.org',
      'https://bibliogram.pussthecat.org'
    ];

    for (const instance of bibliogramInstances) {
      try {
        console.log(`[Instagram] Trying Bibliogram instance: ${instance} for @${username}`);
        const url = `${instance}/u/${username}/rss.xml`;

        const response = await this.httpClient.get(url);
        const feed = await this.parser.parseString(response.data);

        if (feed.items && feed.items.length > 0) {
          const posts = feed.items.map(item => {
            const postId = this.extractPostId(item.link || item.guid);
            return {
              id: postId,
              url: item.link.replace(instance, 'https://www.instagram.com'),
              title: item.title || '',
              description: item.contentSnippet || '',
              publishedAt: new Date(item.pubDate || item.isoDate),
              thumbnail: null
            };
          });

          console.log(`[Instagram] Successfully fetched ${posts.length} posts via Bibliogram`);
          return posts;
        }
      } catch (error) {
        console.log(`[Instagram] Bibliogram instance ${instance} failed:`, error.message);
        continue;
      }
    }

    return [];
  }

  /**
   * Method 3: Scrape Instagram's HTML page (most reliable for real-time data)
   */
  async fetchPostsViaWebScrape(username) {
    try {
      console.log(`[Instagram] Attempting web scrape for @${username}`);

      const url = `https://www.instagram.com/${username}/`;
      const response = await this.httpClient.get(url);

      // Extract JSON data from HTML page
      const html = response.data;

      // Try to extract from window._sharedData (primary method)
      const sharedDataMatch = html.match(/window\._sharedData = ({.+?});<\/script>/);
      if (sharedDataMatch) {
        const sharedData = JSON.parse(sharedDataMatch[1]);
        const userData = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;

        if (userData?.edge_owner_to_timeline_media?.edges) {
          const posts = userData.edge_owner_to_timeline_media.edges.slice(0, 12).map(edge => {
            const node = edge.node;
            return {
              id: node.shortcode,
              url: `https://www.instagram.com/p/${node.shortcode}/`,
              title: '',
              description: node.edge_media_to_caption?.edges[0]?.node?.text || '',
              publishedAt: new Date(node.taken_at_timestamp * 1000),
              thumbnail: node.thumbnail_src || node.display_url
            };
          });

          console.log(`[Instagram] Successfully scraped ${posts.length} posts from web page`);
          return posts;
        }
      }

      console.log(`[Instagram] Could not extract posts from web page for @${username}`);
      return [];

    } catch (error) {
      console.error(`[Instagram] Web scrape error for @${username}:`, error.message);
      return [];
    }
  }

  /**
   * Method 4: Try direct Instagram public API endpoint (may be rate limited)
   */
  async fetchPostsViaDirect(username) {
    try {
      console.log(`[Instagram] Attempting direct API fetch for @${username}`);

      // Instagram's public JSON endpoint (no auth required but heavily rate limited)
      const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

      const response = await this.httpClient.get(url, {
        headers: {
          'X-IG-App-ID': '936619743392459', // Public IG web app ID
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const userData = response.data?.data?.user;
      if (!userData?.edge_owner_to_timeline_media?.edges) {
        return [];
      }

      const posts = userData.edge_owner_to_timeline_media.edges.slice(0, 12).map(edge => {
        const node = edge.node;
        return {
          id: node.shortcode,
          url: `https://www.instagram.com/p/${node.shortcode}/`,
          title: '',
          description: node.edge_media_to_caption?.edges[0]?.node?.text || '',
          publishedAt: new Date(node.taken_at_timestamp * 1000),
          thumbnail: node.thumbnail_src || node.display_url
        };
      });

      console.log(`[Instagram] Successfully fetched ${posts.length} posts via direct API`);
      return posts;

    } catch (error) {
      console.error(`[Instagram] Direct API error for @${username}:`, error.message);
      return [];
    }
  }

  /**
   * Main method: Try multiple strategies to fetch posts (ordered by reliability)
   */
  async fetchRecentPosts(username) {
    // Strategy order (best to worst for real-time data):
    // 1. Direct API (fastest, real-time, but rate limited)
    // 2. Web scrape (reliable, real-time, harder to block)
    // 3. RSS Bridge (slow, cached, but stable)
    // 4. Bibliogram (mostly dead, last resort)

    const strategies = [
      { name: 'Direct API', fn: () => this.fetchPostsViaDirect(username) },
      { name: 'Web Scrape', fn: () => this.fetchPostsViaWebScrape(username) },
      { name: 'RSS Bridge', fn: () => this.fetchPostsViaRSSBridge(username) },
      { name: 'Bibliogram', fn: () => this.fetchPostsViaBibliogram(username) }
    ];

    // If we know what worked last time for this account, try that first
    const lastMethod = this.lastSuccessfulMethod.get(username);
    if (lastMethod) {
      const lastStrategy = strategies.find(s => s.name === lastMethod);
      if (lastStrategy) {
        console.log(`[Instagram] Trying last successful method (${lastMethod}) for @${username}`);
        const posts = await lastStrategy.fn();
        if (posts.length > 0) {
          return posts;
        }
      }
    }

    // Try all strategies in order
    for (const strategy of strategies) {
      const posts = await strategy.fn();

      if (posts.length > 0) {
        console.log(`[Instagram] ✓ Success with ${strategy.name} for @${username}`);
        this.lastSuccessfulMethod.set(username, strategy.name);
        return posts;
      }

      // Add small delay between attempts to avoid triggering rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Instagram] ✗ All methods failed for @${username}`);
    return [];
  }

  /**
   * Extract post ID from Instagram URL or guid
   */
  extractPostId(urlOrGuid) {
    if (!urlOrGuid) return null;

    // Extract from URL like: https://www.instagram.com/p/ABC123xyz/
    const match = urlOrGuid.match(/\/p\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : urlOrGuid;
  }

  /**
   * Get the most recent post for an account
   */
  async getLatestPost(username) {
    const posts = await this.fetchRecentPosts(username);
    return posts.length > 0 ? posts[0] : null;
  }
}

export default InstagramService;
