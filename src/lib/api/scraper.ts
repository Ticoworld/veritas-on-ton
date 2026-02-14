/**
 * Website Text Scraper
 * Fetches readable text content from project websites using Jina Reader API
 * Used for Gemini cross-examination of visual claims vs written content
 */

import axios from "axios";

const JINA_READER_BASE = "https://r.jina.ai";

/**
 * Scraped website content
 */
export interface WebsiteContent {
  title: string;
  description: string;
  content: string;       // Full readable text (markdown)
  wordCount: number;
  success: boolean;
}

/**
 * Fetches readable text content from a website using Jina Reader API
 * Jina Reader converts any URL to clean, LLM-friendly markdown
 * 
 * @param url - The website URL to scrape
 * @returns Parsed website content or null if failed
 */
export async function scrapeWebsiteText(url: string): Promise<WebsiteContent | null> {
  try {
    console.log(`[Scraper] 📖 Fetching text content from ${url.slice(0, 30)}...`);
    
    // Jina Reader API - just prepend r.jina.ai to any URL
    // Use short timeout - this is optional, don't block the main analysis
    const response = await axios.get(`${JINA_READER_BASE}/${url}`, {
      timeout: 3000, // 3 seconds max - fail fast
      headers: {
        'Accept': 'text/plain',
      },
    });

    const content = response.data as string;
    
    if (!content || content.length < 50) {
      console.log("[Scraper] No meaningful content found");
      return null;
    }

    // Extract title from first line (usually # Title format)
    const lines = content.split('\n');
    const titleMatch = lines[0]?.match(/^#\s*(.+)$/);
    const title = titleMatch ? titleMatch[1] : "Unknown";

    // Count words (rough estimate)
    const wordCount = content.split(/\s+/).length;

    // Truncate content to avoid token limits (keep first 2000 chars for analysis)
    const truncatedContent = content.length > 2000 
      ? content.slice(0, 2000) + "\n... [truncated]"
      : content;

    console.log(`[Scraper] ✅ Extracted ${wordCount} words from website`);

    return {
      title,
      description: lines.slice(1, 3).join(' ').slice(0, 200),
      content: truncatedContent,
      wordCount,
      success: true,
    };
  } catch (error) {
    console.error("[Scraper] Failed to fetch website text:", error);
    return null;
  }
}
