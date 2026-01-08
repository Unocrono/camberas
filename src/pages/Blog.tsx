import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, User, Search, Newspaper, Users, Award } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  category: string;
  published_at: string | null;
  reading_time_minutes: number;
  author: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

const categoryLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  news: { label: "Noticia", icon: <Newspaper className="h-3 w-3" />, color: "bg-blue-500" },
  interview_organizer: { label: "Entrevista Organizador", icon: <Users className="h-3 w-3" />, color: "bg-purple-500" },
  interview_runner: { label: "Entrevista Corredor", icon: <Award className="h-3 w-3" />, color: "bg-green-500" },
};

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
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
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = posts.filter((post) => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredPost = filteredPosts[0];
  const otherPosts = filteredPosts.slice(1);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Noticias y Entrevistas</h1>
          <p className="text-muted-foreground">
            Descubre las últimas novedades del mundo del trail running y MTB
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artículos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge
              variant={selectedCategory === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              Todas
            </Badge>
            {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
              <Badge
                key={key}
                variant={selectedCategory === key ? "default" : "outline"}
                className="cursor-pointer flex items-center gap-1"
                onClick={() => setSelectedCategory(key)}
              >
                {icon}
                {label}
              </Badge>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No hay artículos</h2>
            <p className="text-muted-foreground">
              {searchTerm || selectedCategory
                ? "No se encontraron artículos con los filtros seleccionados"
                : "Próximamente publicaremos contenido interesante"}
            </p>
          </div>
        ) : (
          <>
            {/* Featured Post */}
            {featuredPost && (
              <Link to={`/noticias/${featuredPost.slug}`} className="block mb-8">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="md:flex">
                    <div className="md:w-2/3">
                      {featuredPost.cover_image_url ? (
                        <img
                          src={featuredPost.cover_image_url}
                          alt={featuredPost.title}
                          className="h-64 md:h-80 w-full object-cover"
                        />
                      ) : (
                        <div className="h-64 md:h-80 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <Newspaper className="h-16 w-16 text-primary/40" />
                        </div>
                      )}
                    </div>
                    <CardContent className="md:w-1/3 p-6 flex flex-col justify-center">
                      <Badge className={`w-fit mb-3 ${categoryLabels[featuredPost.category]?.color} text-white`}>
                        {categoryLabels[featuredPost.category]?.icon}
                        <span className="ml-1">{categoryLabels[featuredPost.category]?.label}</span>
                      </Badge>
                      <h2 className="text-2xl font-bold mb-3 line-clamp-3">
                        {featuredPost.title}
                      </h2>
                      {featuredPost.excerpt && (
                        <p className="text-muted-foreground mb-4 line-clamp-3">
                          {featuredPost.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {featuredPost.published_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(featuredPost.published_at), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {featuredPost.reading_time_minutes} min
                        </span>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            )}

            {/* Grid de posts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherPosts.map((post) => (
                <Link key={post.id} to={`/noticias/${post.slug}`}>
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
                    {post.cover_image_url ? (
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="h-48 w-full object-cover"
                      />
                    ) : (
                      <div className="h-48 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <Newspaper className="h-12 w-12 text-primary/40" />
                      </div>
                    )}
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <Badge className={`w-fit mb-2 ${categoryLabels[post.category]?.color} text-white text-xs`}>
                        {categoryLabels[post.category]?.label}
                      </Badge>
                      <h3 className="font-semibold mb-2 line-clamp-2 flex-1">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                        {post.published_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(post.published_at), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {post.reading_time_minutes} min
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
