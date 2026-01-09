import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, Eye, Upload, X, Image as ImageIcon } from "lucide-react";
import SimpleMarkdownEditor from "./SimpleMarkdownEditor";

interface BlogPostEditorProps {
  postId?: string;
  onClose: (saved: boolean) => void;
}

interface Timestamp {
  time: string;
  label: string;
}

export default function BlogPostEditor({ postId, onClose }: BlogPostEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    excerpt: "",
    content: "",
    category: "news",
    status: "draft",
    cover_image_url: "",
    youtube_video_id: "",
    meta_title: "",
    meta_description: "",
    race_id: "",
  });
  
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (error) throw error;
      
      setFormData({
        title: data.title || "",
        excerpt: data.excerpt || "",
        content: data.content || "",
        category: data.category || "news",
        status: data.status || "draft",
        cover_image_url: data.cover_image_url || "",
        youtube_video_id: data.youtube_video_id || "",
        meta_title: data.meta_title || "",
        meta_description: data.meta_description || "",
        race_id: data.race_id || "",
      });
      setTimestamps(Array.isArray(data.youtube_timestamps) ? (data.youtube_timestamps as unknown as Timestamp[]) : []);
    } catch (error) {
      console.error("Error fetching post:", error);
      toast.error("Error al cargar el artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (publish = false) => {
    if (!formData.title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }

    try {
      setSaving(true);
      
      const postData = {
        title: formData.title,
        excerpt: formData.excerpt || null,
        content: formData.content,
        category: formData.category,
        cover_image_url: formData.cover_image_url || null,
        youtube_video_id: formData.youtube_video_id || null,
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        youtube_timestamps: timestamps as unknown as Json,
        author_id: user?.id,
        status: publish ? "published" : formData.status,
        published_at: publish ? new Date().toISOString() : null,
        race_id: formData.race_id || null,
      };

      if (postId) {
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", postId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("blog_posts")
          .insert(postData);
        if (error) throw error;
      }

      toast.success(publish ? "Artículo publicado" : "Artículo guardado");
      onClose(true);
    } catch (error: any) {
      console.error("Error saving post:", error);
      toast.error(error.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const addTimestamp = () => {
    setTimestamps([...timestamps, { time: "0:00", label: "" }]);
  };

  const removeTimestamp = (index: number) => {
    setTimestamps(timestamps.filter((_, i) => i !== index));
  };

  const updateTimestamp = (index: number, field: "time" | "label", value: string) => {
    const updated = [...timestamps];
    updated[index][field] = value;
    setTimestamps(updated);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    // Validar tamaño (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5MB");
      return;
    }

    try {
      setUploading(true);
      
      // Generar nombre único
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `covers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('blog-images')
        .getPublicUrl(filePath);

      setFormData({ ...formData, cover_image_url: publicUrl });
      toast.success("Imagen subida correctamente");
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast.error(error.message || "Error al subir la imagen");
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Título del artículo"
        />
      </div>

      {/* Categoría y Estado */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Categoría</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="news">Noticia</SelectItem>
              <SelectItem value="interview_organizer">Entrevista Organizador</SelectItem>
              <SelectItem value="interview_runner">Entrevista Corredor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="archived">Archivado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Imagen de portada */}
      <div className="space-y-2">
        <Label>Imagen de portada (1200x630px recomendado)</Label>
        
        {/* Preview de imagen */}
        {formData.cover_image_url && (
          <div className="relative w-full max-w-md rounded-lg overflow-hidden border border-border">
            <img 
              src={formData.cover_image_url} 
              alt="Portada" 
              className="w-full h-40 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <Button 
              variant="destructive" 
              size="icon" 
              className="absolute top-2 right-2 h-7 w-7"
              onClick={() => setFormData({ ...formData, cover_image_url: "" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Botón de subir + Input URL */}
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="shrink-0"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Subir imagen
          </Button>
          <Input
            value={formData.cover_image_url}
            onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
            placeholder="O pega una URL..."
            className="flex-1"
          />
        </div>
        
        {!formData.cover_image_url && (
          <div className="flex items-center justify-center w-full max-w-md h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin imagen de portada</p>
            </div>
          </div>
        )}
      </div>

      {/* Extracto */}
      <div className="space-y-2">
        <Label>Extracto (resumen para cards)</Label>
        <Textarea
          value={formData.excerpt}
          onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
          placeholder="Breve resumen del artículo..."
          rows={2}
        />
      </div>

      {/* YouTube */}
      <div className="space-y-2">
        <Label>ID de Video YouTube (opcional)</Label>
        <Input
          value={formData.youtube_video_id}
          onChange={(e) => setFormData({ ...formData, youtube_video_id: e.target.value })}
          placeholder="ej: dQw4w9WgXcQ"
        />
      </div>

      {/* Timestamps */}
      {formData.youtube_video_id && (
        <div className="space-y-2">
          <Label>Capítulos del video</Label>
          {timestamps.map((ts, i) => (
            <div key={i} className="flex gap-2">
              <Input value={ts.time} onChange={(e) => updateTimestamp(i, "time", e.target.value)} placeholder="0:00" className="w-24" />
              <Input value={ts.label} onChange={(e) => updateTimestamp(i, "label", e.target.value)} placeholder="Descripción" className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => removeTimestamp(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTimestamp}><Plus className="h-4 w-4 mr-1" />Añadir</Button>
        </div>
      )}

      {/* SEO */}
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="font-medium text-sm text-muted-foreground">🔍 SEO (Opcional)</h3>
        <div className="space-y-2">
          <Label htmlFor="meta_title">Meta título (máx. 60 caracteres)</Label>
          <Input
            id="meta_title"
            value={formData.meta_title}
            onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
            placeholder="Título para buscadores (si vacío, usa el título del artículo)"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">{formData.meta_title.length}/60</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meta_description">Meta descripción (máx. 160 caracteres)</Label>
          <Textarea
            id="meta_description"
            value={formData.meta_description}
            onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
            placeholder="Descripción para buscadores (si vacío, usa el extracto)"
            maxLength={160}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">{formData.meta_description.length}/160</p>
        </div>
      </div>

      {/* Contenido con vista previa */}
      <div className="space-y-2">
        <Label>Contenido (Markdown)</Label>
        <SimpleMarkdownEditor
          value={formData.content}
          onChange={(content) => setFormData({ ...formData, content })}
          placeholder="Escribe el contenido usando Markdown..."
          rows={16}
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
        <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar borrador
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          Publicar
        </Button>
      </div>
    </div>
  );
}
