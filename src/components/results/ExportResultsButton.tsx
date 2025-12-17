import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Table } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface RaceResult {
  id: string;
  finish_time: any;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  status: string;
  registration: {
    bib_number: number | null;
    guest_first_name: string | null;
    guest_last_name: string | null;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      gender: string | null;
    } | null;
    race_distances: {
      name: string;
      distance_km: number;
    };
  };
}

interface ExportResultsButtonProps {
  results: RaceResult[];
  raceName: string;
  raceDate: string;
  distanceName?: string;
}

export function ExportResultsButton({ 
  results, 
  raceName, 
  raceDate,
  distanceName 
}: ExportResultsButtonProps) {
  const [exporting, setExporting] = useState(false);

  const getRunnerName = (result: RaceResult) => {
    const firstName = result.registration.profiles?.first_name || result.registration.guest_first_name || "";
    const lastName = result.registration.profiles?.last_name || result.registration.guest_last_name || "";
    return `${firstName} ${lastName}`.trim() || `Dorsal #${result.registration.bib_number}`;
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return "--:--:--";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : timeString;
  };

  const finishedResults = results
    .filter(r => r.status === 'FIN')
    .sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999));

  const handleExportPDF = async () => {
    if (finishedResults.length === 0) {
      toast.error("No hay resultados para exportar");
      return;
    }

    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(raceName, pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${new Date(raceDate).toLocaleDateString('es-ES', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })}`, pageWidth / 2, 28, { align: "center" });
      
      if (distanceName) {
        doc.text(`Distancia: ${distanceName}`, pageWidth / 2, 35, { align: "center" });
      }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CLASIFICACIÓN GENERAL", pageWidth / 2, 48, { align: "center" });

      // Table headers
      let y = 58;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y - 5, pageWidth - 20, 8, 'F');
      doc.text("Pos", 15, y);
      doc.text("Dorsal", 30, y);
      doc.text("Nombre", 50, y);
      doc.text("Distancia", 110, y);
      doc.text("Tiempo", 145, y);
      doc.text("Cat", 175, y);
      
      y += 10;
      doc.setFont("helvetica", "normal");

      // Table rows
      finishedResults.forEach((result, index) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(10, y - 5, pageWidth - 20, 7, 'F');
        }

        doc.text(String(result.overall_position || '-'), 15, y);
        doc.text(String(result.registration.bib_number || '-'), 30, y);
        doc.text(getRunnerName(result).substring(0, 35), 50, y);
        doc.text(result.registration.race_distances.name.substring(0, 15), 110, y);
        doc.text(formatTime(result.finish_time), 145, y);
        doc.text(String(result.category_position || '-'), 175, y);
        
        y += 7;
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`Generado el ${new Date().toLocaleString('es-ES')} - Camberas.com`, pageWidth / 2, 290, { align: "center" });

      // Save
      const fileName = `resultados_${raceName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success("PDF generado correctamente");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Error al generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (finishedResults.length === 0) {
      toast.error("No hay resultados para exportar");
      return;
    }

    try {
      const headers = ["Posición", "Dorsal", "Nombre", "Distancia", "Tiempo", "Pos. Categoría", "Pos. Género"];
      const rows = finishedResults.map(result => [
        result.overall_position || '-',
        result.registration.bib_number || '-',
        getRunnerName(result),
        result.registration.race_distances.name,
        formatTime(result.finish_time),
        result.category_position || '-',
        result.gender_position || '-'
      ]);

      const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.join(';'))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resultados_${raceName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("CSV exportado correctamente");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Error al exportar CSV");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={exporting}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{exporting ? "Exportando..." : "Exportar"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4" />
          Descargar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
          <Table className="h-4 w-4" />
          Descargar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
