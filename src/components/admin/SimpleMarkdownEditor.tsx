import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  Heading3, 
  Link, 
  List, 
  ListOrdered, 
  Quote, 
  Code,
  Image,
  FileText,
  Monitor
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface SimpleMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  previewPlaceholder?: string;
}

export default function SimpleMarkdownEditor({
  value,
  onChange,
  placeholder = "Escribe el contenido usando Markdown...",
  rows = 16,
  previewPlaceholder = "Sin contenido para previsualizar..."
}: SimpleMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertText = (before: string, after: string = "", placeholder: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const textToInsert = selectedText || placeholder;
    
    const newValue = 
      value.substring(0, start) + 
      before + textToInsert + after + 
      value.substring(end);
    
    onChange(newValue);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + textToInsert.length + after.length;
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + textToInsert.length
      );
    }, 0);
  };

  const insertAtLineStart = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    
    const newValue = 
      value.substring(0, lineStart) + 
      prefix + 
      value.substring(lineStart);
    
    onChange(newValue);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  const toolbarButtons = [
    { icon: Bold, action: () => insertText("**", "**", "texto en negrita"), title: "Negrita" },
    { icon: Italic, action: () => insertText("*", "*", "texto en cursiva"), title: "Cursiva" },
    { icon: Heading1, action: () => insertAtLineStart("# "), title: "Título 1" },
    { icon: Heading2, action: () => insertAtLineStart("## "), title: "Título 2" },
    { icon: Heading3, action: () => insertAtLineStart("### "), title: "Título 3" },
    { icon: Link, action: () => insertText("[", "](url)", "texto del enlace"), title: "Enlace" },
    { icon: Image, action: () => insertText("![", "](url)", "alt de imagen"), title: "Imagen" },
    { icon: List, action: () => insertAtLineStart("- "), title: "Lista" },
    { icon: ListOrdered, action: () => insertAtLineStart("1. "), title: "Lista numerada" },
    { icon: Quote, action: () => insertAtLineStart("> "), title: "Cita" },
    { icon: Code, action: () => insertText("`", "`", "código"), title: "Código" },
  ];

  return (
    <Tabs defaultValue="edit" className="w-full">
      <div className="flex items-center justify-between gap-2 mb-2">
        <TabsList className="grid grid-cols-2 w-auto">
          <TabsTrigger value="edit" className="flex items-center gap-2 px-3">
            <FileText className="h-4 w-4" />
            Editar
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2 px-3">
            <Monitor className="h-4 w-4" />
            Vista previa
          </TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="edit" className="mt-0 space-y-2">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-1 p-1 border rounded-md bg-muted/30">
          {toolbarButtons.map((btn, i) => (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="sm"
              onClick={btn.action}
              title={btn.title}
              className="h-8 w-8 p-0"
            >
              <btn.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
        
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="font-mono text-sm"
        />
      </TabsContent>
      
      <TabsContent value="preview" className="mt-0">
        <div 
          className="min-h-[300px] max-h-[600px] overflow-y-auto p-4 border rounded-md bg-background prose prose-sm dark:prose-invert max-w-none"
          style={{ minHeight: `${rows * 1.5}rem` }}
        >
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic">{previewPlaceholder}</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
