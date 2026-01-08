import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Clock, 
  ArrowLeft, 
  Share2, 
  Newspaper, 
  Users, 
  Award,
  MapPin,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import YouTubeEmbed from "@/components/blog/YouTubeEmbed";
import ShareButtons from "@/components/blog/ShareButtons";
import BlogSEO from "@/components/blog/BlogSEO";

interface BlogPostData {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  category: string;
  status: string;
  youtube_video_id: string | null;
  youtube_timestamps: { time: string; label: string }[] | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  published_at: string | null;
  reading_time_minutes: number;
  view_count: number;
  author: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  race: {
    id: string;
    name: string;
    slug: string | null;
    date: string;
  } | null;
  tags: {
    id: string;
    name: string;
    slug: string;
  }[];
}

const categoryLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  news: { label: "Noticia", icon: <Newspaper className="h-4 w-4" />, color: "bg-blue-500" },
  interview_organizer: { label: "Entrevista Organizador", icon: <Users className="h-4 w-4" />, color: "bg-purple-500" },
  interview_runner: { label: "Entrevista Corredor", icon: <Award className="h-4 w-4" />, color: "bg-green-500" },
};

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedPosts, setRelatedPosts] = useState<BlogPostData[]>([]);

  useEffect(() => {
    if (slug) {
      fetchPost();
    }
  }, [slug]);

  const fetchPost = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select(`
          *,
          author:profiles!blog_posts_author_id_fkey(first_name, last_name),
          race:races!blog_posts_race_id_fkey(id, name, slug, date)
        `)
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (error) throw error;
      
      // Fetch tags
      const { data: tagsData } = await supabase
        .from("blog_post_tags")
        .select("tag:blog_tags(*)")
        .eq("post_id", data.id);

      const postWithTags = {
        ...data,
        youtube_timestamps: data.youtube_timestamps as { time: string; label: string }[] | null,
        tags: tagsData?.map(t => t.tag) || []
      };

      setPost(postWithTags);

      // Increment view count
      await supabase
        .from("blog_posts")
        .update({ view_count: (data.view_count || 0) + 1 })
        .eq("id", data.id);

      // Fetch related posts
      fetchRelatedPosts(data.id, data.category);
    } catch (error) {
      console.error("Error fetching post:", error);
      navigate("/noticias");
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedPosts = async (postId: string, category: string) => {
    try {
      const { data } = await supabase
        .from("blog_posts")
        .select(`
          id,
          slug,
          title,
          excerpt,
          cover_image_url,
          category,
          published_at,
          reading_time_minutes,
          author:profiles!blog_posts_author_id_fkey(first_name, last_name)
        `)
        .eq("status", "published")
        .eq("category", category)
        .neq("id", postId)
        .order("published_at", { ascending: false })
        .limit(3);

      setRelatedPosts((data || []) as BlogPostData[]);
    } catch (error) {
      console.error("Error fetching related posts:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <Skeleton className="h-96 w-full mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return null;
  }

  const postUrl = `${window.location.origin}/noticias/${post.slug}`;
  const authorName = post.author 
    ? `${post.author.first_name || ""} ${post.author.last_name || ""}`.trim() 
    : "Camberas";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <BlogSEO post={post} />
      <Navbar />
      
      <main className="flex-1">
        <article className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Back link */}
          <Link to="/noticias" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" />
            Volver a Noticias
          </Link>

          {/* Category */}
          <Badge className={`mb-4 ${categoryLabels[post.category]?.color} text-white`}>
            {categoryLabels[post.category]?.icon}
            <span className="ml-1">{categoryLabels[post.category]?.label}</span>
          </Badge>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            {post.title}
          </h1>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
            {post.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(post.published_at), "d 'de' MMMM, yyyy", { locale: es })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.reading_time_minutes} min de lectura
            </span>
            {authorName && (
              <span>Por {authorName}</span>
            )}
          </div>

          {/* Cover image */}
          {post.cover_image_url && (
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="w-full h-64 md:h-96 object-cover rounded-lg mb-8"
            />
          )}

          {/* Share buttons */}
          <div className="mb-8">
            <ShareButtons url={postUrl} title={post.title} />
          </div>

          {/* YouTube video */}
          {post.youtube_video_id && (
            <div className="mb-8">
              <YouTubeEmbed 
                videoId={post.youtube_video_id} 
                timestamps={post.youtube_timestamps}
              />
            </div>
          )}

          <Separator className="mb-8" />

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-2xl font-bold mt-6 mb-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-primary pl-4 italic my-6 text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => (
                  <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          <Separator className="mb-8" />

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Etiquetas</h3>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Linked race */}
          {post.race && (
            <Card className="mb-8">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Carrera relacionada</h3>
                <Link 
                  to={post.race.slug ? `/${post.race.slug}` : `/race/${post.race.id}`}
                  className="flex items-center justify-between hover:bg-muted/50 rounded-lg p-2 -m-2"
                >
                  <div>
                    <p className="font-semibold">{post.race.name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(post.race.date), "d MMM yyyy", { locale: es })}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Share buttons bottom */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Compartir artículo</h3>
            <ShareButtons url={postUrl} title={post.title} />
          </div>

          {/* Related posts */}
          {relatedPosts.length > 0 && (
            <div>
              <Separator className="mb-8" />
              <h2 className="text-2xl font-bold mb-6">Artículos relacionados</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((related) => (
                  <Link key={related.id} to={`/noticias/${related.slug}`}>
                    <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                      {related.cover_image_url ? (
                        <img
                          src={related.cover_image_url}
                          alt={related.title}
                          className="h-32 w-full object-cover"
                        />
                      ) : (
                        <div className="h-32 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <Newspaper className="h-8 w-8 text-primary/40" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold line-clamp-2">{related.title}</h3>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
}
