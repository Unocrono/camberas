import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Trash2, Image as ImageIcon, FileText, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FileItem {
  name: string;
  id: string;
  created_at: string;
  updated_at: string;
  metadata: any;
}

const BUCKETS = [
  { id: "race-images", name: "Imágenes de Carreras" },
  { id: "race-photos", name: "Fotos de Resultados" },
  { id: "race-gpx", name: "Archivos GPX" },
];

export const StorageManagement = () => {
  const { toast } = useToast();
  const [selectedBucket, setSelectedBucket] = useState(BUCKETS[0].id);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadFiles();
  }, [selectedBucket]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(selectedBucket).list();

      if (error) throw error;

      setFiles(data || []);
    } catch (error: any) {
      console.error("Error loading files:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los archivos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast({
        title: "Error",
        description: "Selecciona un archivo primero",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = uploadFile.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from(selectedBucket)
        .upload(fileName, uploadFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Archivo subido correctamente",
      });

      setUploadFile(null);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
      loadFiles();
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo subir el archivo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${fileName}"?`)) return;

    try {
      const { error } = await supabase.storage.from(selectedBucket).remove([fileName]);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Archivo eliminado correctamente",
      });

      loadFiles();
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el archivo",
        variant: "destructive",
      });
    }
  };

  const getPublicUrl = (fileName: string) => {
    const { data } = supabase.storage.from(selectedBucket).getPublicUrl(fileName);
    return data.publicUrl;
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Copiado",
      description: "URL copiada al portapapeles",
    });
  };

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isImage = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Gestor de Archivos Multimedia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bucket Selector */}
          <div className="space-y-2">
            <Label>Seleccionar Bucket</Label>
            <Select value={selectedBucket} onValueChange={setSelectedBucket}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKETS.map((bucket) => (
                  <SelectItem key={bucket.id} value={bucket.id}>
                    {bucket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subir Archivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Seleccionar archivo</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                />
              </div>
              <Button onClick={handleUpload} disabled={!uploadFile || uploading} className="w-full">
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir Archivo
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Files List */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar archivos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <Alert>
                <AlertDescription>
                  {searchTerm ? "No se encontraron archivos" : "No hay archivos en este bucket"}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFiles.map((file) => {
                  const url = getPublicUrl(file.name);
                  return (
                    <Card key={file.id} className="overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        {isImage(file.name) ? (
                          <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                            <img
                              src={url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                            <FileText className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        <div className="space-y-2">
                          <p className="text-sm font-medium truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(file.created_at).toLocaleDateString()}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => copyToClipboard(url)}
                            >
                              Copiar URL
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(file.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
