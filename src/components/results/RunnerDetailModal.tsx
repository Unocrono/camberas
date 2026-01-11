import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Youtube, User, Trophy, Clock, MapPin, Users, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SplitTime {
  id: string;
  checkpoint_id?: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: string;
  distance_km: number;
  overall_position?: number | null;
  gender_position?: number | null;
  category_position?: number | null;
}

interface RaceCheckpoint {
  id: string;
  name: string;
  distance_km: number;
  checkpoint_order: number;
  checkpoint_type: string;
  youtube_video_id: string | null;
  youtube_enabled: boolean | null;
}

interface RunnerData {
  bibNumber: number | null;
  name: string;
  category: string;
  gender: string;
  club: string;
  team: string;
  status: string;
  finishTime: string;
  overallPosition: number | null;
  categoryPosition: number | null;
  genderPosition: number | null;
  distanceName: string;
  splitTimes: SplitTime[];
}

interface TotalCounts {
  finishers: number;
  categoryFinishers: number;
  genderFinishers: number;
}

interface WaveInfo {
  start_time: string | null;
}

interface RunnerDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runner: RunnerData | null;
  totals: TotalCounts;
  checkpoints: RaceCheckpoint[];
  wave: WaveInfo | null;
  onYoutubeClick?: (checkpoint: RaceCheckpoint, splitTime: string, runnerName: string) => void;
}

export function RunnerDetailModal({
  open,
  onOpenChange,
  runner,
  totals,
  checkpoints,
  wave,
  onYoutubeClick
}: RunnerDetailModalProps) {
  if (!runner) return null;

  const formatTime = (timeString: string): string => {
    if (!timeString) return "--:--:--";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : timeString;
  };

  const formatTimeOfDay = (splitTimeStr: string, waveStartTime: string | null): string => {
    if (!splitTimeStr || !waveStartTime) return "--:--:--";
    
    const splitMatch = splitTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!splitMatch) return "--:--:--";
    
    const splitSeconds = parseInt(splitMatch[1]) * 3600 + parseInt(splitMatch[2]) * 60 + parseInt(splitMatch[3]);
    const waveStart = new Date(waveStartTime);
    const crossingTime = new Date(waveStart.getTime() + splitSeconds * 1000);
    
    return crossingTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Filter checkpoints that have split times
  const checkpointsWithSplits = checkpoints
    .filter(cp => runner.splitTimes.some(st => st.checkpoint_id === cp.id || st.checkpoint_order === cp.checkpoint_order))
    .sort((a, b) => a.checkpoint_order - b.checkpoint_order);

  const getSplitForCheckpoint = (checkpoint: RaceCheckpoint): SplitTime | undefined => {
    return runner.splitTimes.find(st => 
      st.checkpoint_id === checkpoint.id || st.checkpoint_order === checkpoint.checkpoint_order
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'FIN':
      case 'finished':
        return <Badge variant="default" className="bg-green-600">Finalizado</Badge>;
      case 'STD':
      case 'in_progress':
        return <Badge variant="secondary" className="bg-blue-500 text-white">En Carrera</Badge>;
      case 'DNF':
        return <Badge variant="destructive">No Finalizó</Badge>;
      case 'DNS':
        return <Badge variant="outline">No Salió</Badge>;
      case 'DSQ':
        return <Badge variant="destructive">Descalificado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isFinished = runner.status === 'FIN' || runner.status === 'finished';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalle del Corredor
          </DialogTitle>
        </DialogHeader>

        {/* Runner Header */}
        <div className="space-y-4">
          {/* Main info */}
          <div className="flex flex-col md:flex-row md:items-start gap-4 p-4 bg-muted/50 rounded-lg">
            {/* Bib Number */}
            <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-primary text-primary-foreground rounded-xl text-2xl md:text-3xl font-bold shrink-0">
              {runner.bibNumber || '-'}
            </div>
            
            {/* Info */}
            <div className="flex-1 space-y-2">
              <div>
                <h3 className="text-xl font-bold">{runner.name}</h3>
                <p className="text-sm text-muted-foreground">{runner.distanceName}</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{runner.category || '-'}</Badge>
                <Badge variant="outline">{runner.gender === 'M' ? 'Masculino' : runner.gender === 'F' ? 'Femenino' : runner.gender}</Badge>
                {getStatusBadge(runner.status)}
              </div>
              
              {(runner.club || runner.team) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {runner.club && <span>{runner.club}</span>}
                  {runner.club && runner.team && <span>•</span>}
                  {runner.team && <span>{runner.team}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Results Panel */}
          {isFinished && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Finish Time */}
              <div className="p-3 bg-primary/10 rounded-lg text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" />
                  Tiempo
                </div>
                <div className="text-lg md:text-xl font-bold font-mono text-primary">
                  {formatTime(runner.finishTime)}
                </div>
              </div>
              
              {/* Overall Position */}
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                  <Trophy className="h-3 w-3" />
                  General
                </div>
                <div className="text-lg md:text-xl font-bold">
                  {runner.overallPosition || '-'}
                  <span className="text-sm font-normal text-muted-foreground">/{totals.finishers}</span>
                </div>
              </div>
              
              {/* Category Position */}
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-xs text-muted-foreground mb-1">Categoría</div>
                <div className="text-lg md:text-xl font-bold">
                  {runner.categoryPosition || '-'}
                  <span className="text-sm font-normal text-muted-foreground">/{totals.categoryFinishers}</span>
                </div>
              </div>
              
              {/* Gender Position */}
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-xs text-muted-foreground mb-1">Sexo</div>
                <div className="text-lg md:text-xl font-bold">
                  {runner.genderPosition || '-'}
                  <span className="text-sm font-normal text-muted-foreground">/{totals.genderFinishers}</span>
                </div>
              </div>
            </div>
          )}

          {/* Split Times Table */}
          {checkpointsWithSplits.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Pasos por Control
              </h4>
              
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Control</TableHead>
                      <TableHead className="text-center font-semibold">Km</TableHead>
                      <TableHead className="text-center font-semibold">T. Carrera</TableHead>
                      <TableHead className="text-center font-semibold hidden md:table-cell">Hora</TableHead>
                      <TableHead className="text-center font-semibold hidden md:table-cell">Gral</TableHead>
                      <TableHead className="text-center font-semibold hidden md:table-cell">Cat</TableHead>
                      <TableHead className="text-center font-semibold hidden md:table-cell">Sexo</TableHead>
                      <TableHead className="text-center font-semibold w-12 hidden md:table-cell"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkpointsWithSplits.map((checkpoint) => {
                      const split = getSplitForCheckpoint(checkpoint);
                      if (!split) return null;
                      
                      const hasYoutube = checkpoint.youtube_enabled && checkpoint.youtube_video_id;
                      
                      return (
                        <TableRow key={checkpoint.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {checkpoint.checkpoint_type === 'FINISH' ? (
                                <Flag className="h-4 w-4 text-primary" />
                              ) : (
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="truncate max-w-[120px] md:max-w-none">{checkpoint.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {checkpoint.distance_km?.toFixed(1) || '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-primary">
                            {formatTime(split.split_time)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-muted-foreground hidden md:table-cell">
                            {formatTimeOfDay(split.split_time, wave?.start_time || null)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm hidden md:table-cell">
                            {split.overall_position || '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm hidden md:table-cell">
                            {split.category_position || '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm hidden md:table-cell">
                            {split.gender_position || '-'}
                          </TableCell>
                          <TableCell className="text-center hidden md:table-cell">
                            {hasYoutube && onYoutubeClick && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => onYoutubeClick(checkpoint, split.split_time, runner.name)}
                              >
                                <Youtube className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Mobile-only simplified splits view */}
              <div className="md:hidden space-y-2">
                {checkpointsWithSplits.map((checkpoint) => {
                  const split = getSplitForCheckpoint(checkpoint);
                  if (!split) return null;
                  
                  const hasYoutube = checkpoint.youtube_enabled && checkpoint.youtube_video_id;
                  
                  return (
                    <div key={`mobile-${checkpoint.id}`} className="p-3 bg-muted/30 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-muted-foreground">
                          {formatTimeOfDay(split.split_time, wave?.start_time || null)}
                        </span>
                        {hasYoutube && onYoutubeClick && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-red-600 hover:text-red-700"
                            onClick={() => onYoutubeClick(checkpoint, split.split_time, runner.name)}
                          >
                            <Youtube className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-xs text-muted-foreground">General</div>
                          <div className="font-mono font-semibold">{split.overall_position || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Categoría</div>
                          <div className="font-mono font-semibold">{split.category_position || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sexo</div>
                          <div className="font-mono font-semibold">{split.gender_position || '-'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {checkpointsWithSplits.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay pasos de control registrados</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
