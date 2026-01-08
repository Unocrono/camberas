import { useEffect } from "react";

interface BlogSEOProps {
  post: {
    title: string;
    excerpt: string | null;
    meta_title: string | null;
    meta_description: string | null;
    og_image_url: string | null;
    cover_image_url: string | null;
    slug: string;
    published_at: string | null;
    author: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  };
}

export default function BlogSEO({ post }: BlogSEOProps) {
  useEffect(() => {
    const title = post.meta_title || post.title;
    const description = post.meta_description || post.excerpt || "";
    const image = post.og_image_url || post.cover_image_url || "";
    const url = `${window.location.origin}/noticias/${post.slug}`;
    const authorName = post.author 
      ? `${post.author.first_name || ""} ${post.author.last_name || ""}`.trim() 
      : "Camberas";

    // Update document title
    document.title = `${title} | Camberas`;

    // Helper to set or create meta tag
    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? "property" : "name";
      let meta = document.querySelector(`meta[${attr}="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Standard meta tags
    setMeta("description", description);
    setMeta("author", authorName);

    // Open Graph tags
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:type", "article", true);
    setMeta("og:url", url, true);
    if (image) {
      setMeta("og:image", image, true);
      setMeta("og:image:width", "1200", true);
      setMeta("og:image:height", "630", true);
    }
    setMeta("og:site_name", "Camberas", true);

    // Twitter Card tags
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    if (image) {
      setMeta("twitter:image", image);
    }

    // Article specific
    if (post.published_at) {
      setMeta("article:published_time", post.published_at, true);
    }

    // Cleanup on unmount
    return () => {
      document.title = "Camberas";
    };
  }, [post]);

  return null;
}
