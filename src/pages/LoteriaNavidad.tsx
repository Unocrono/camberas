import { useState, useEffect, useCallback } from "react";
import { Trophy, RefreshCw, Gift } from "lucide-react";Sin coincidencia con premios mayores ni pedrea.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import camberasLogo from "@/assets/camberas-logo-transparent.png";

// Datos de la peña (hardcoded del CSV)
const PENA_DATA = [
  { globero: "Carlos", num1: "05288", num2: "05288" },
  { globero: "Ana", num1: "18852", num2: "41143" },
  { globero: "Corada", num1: "92951", num2: "39313" },
  { globero: "Morán", num1: "47667", num2: "99705" },
  { globero: "Pajarín", num1: "08439", num2: "08439" },
  { globero: "Enrique", num1: "54307", num2: "54307" },
  { globero: "Manolín", num1: "22459", num2: "95718" },
  { globero: "Joel", num1: "87982", num2: "06906" },
  { globero: "Mazón", num1: "76931", num2: "76931" },
  { globero: "Cena", num1: "94614", num2: "" },
];

// Tipos de premios según la cuantía
const getPrizeType = (prize: number): string => {
  if (prize === 0) return "";
  if (prize >= 4000000) return "El Gordo";
  if (prize >= 1250000) return "Segundo Premio";
  if (prize >= 500000) return "Tercer Premio";
  if (prize >= 200000) return "Cuarto Premio";
  if (prize >= 60000) return "Quinto Premio";
  if (prize >= 1000) return "Pedrea";
  return "Reintegro";
};

// Función para consultar la API de El País
const checkLotteryPrize = async (number: string): Promise<number> => {
  if (!number || number.length !== 5) return 0;
  try {
    const response = await fetch(`https://api.elpais.com/ws/LoteriaNavidadPremiados?n=${number}`);
    if (!response.ok) return 0;
    const data = await response.json();
    if (data && data.premio) {
      return data.premio * 20; // Premio por décimo
    }
    return 0;
  } catch (error) {
    console.error("Error consultando el número:", number, error);
    return 0;
  }
};

interface PrizeResult {
  number: string;
  prize: number;
  timestamp: Date;
}

interface GloberoResult {
  globero: string;
  num1: string;
  num2: string;
  prize1: number;
  prize2: number;
  total: number;
}

const LoteriaNavidad = () => {
  const [lastPrize, setLastPrize] = useState<PrizeResult | null>(null);
  const [globeroResults, setGloberoResults] = useState<GloberoResult[]>([]);
  const [totalPena, setTotalPena] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Consultar premios de todos los números de la peña
  const refreshPrizes = useCallback(async () => {
    setIsRefreshing(true);
    const results: GloberoResult[] = [];
    let total = 0;
    let latestPrize: PrizeResult | null = null;

    for (const person of PENA_DATA) {
      const prize1 = await checkLotteryPrize(person.num1);
      const prize2 = person.num2 ? await checkLotteryPrize(person.num2) : 0;

      // Si Num1 = Num2, contar como dos décimos del mismo número
      let personTotal = 0;
      if (person.num1 === person.num2 && person.num1) {
        personTotal = prize1 * 2;
      } else {
        personTotal = prize1 + prize2;
      }

      results.push({
        globero: person.globero,
        num1: person.num1,
        num2: person.num2,
        prize1,
        prize2,
        total: personTotal,
      });

      total += personTotal;

      // Detectar el último premio encontrado
      if (prize1 > 0 && (!latestPrize || prize1 > latestPrize.prize)) {
        latestPrize = { number: person.num1, prize: prize1, timestamp: new Date() };
      }
      if (prize2 > 0 && (!latestPrize || prize2 > latestPrize.prize)) {
        latestPrize = { number: person.num2, prize: prize2, timestamp: new Date() };
      }
    }

    setGloberoResults(results);
    setTotalPena(total);
    if (latestPrize) setLastPrize(latestPrize);
    setLastUpdate(new Date());
    setIsRefreshing(false);
  }, []);

  // Refresco automático cada 60 segundos
  useEffect(() => {
    refreshPrizes();
    const interval = setInterval(refreshPrizes, 60000);
    return () => clearInterval(interval);
  }, [refreshPrizes]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header con logo */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={camberasLogo} alt="Camberas" className="h-10 w-auto opacity-80" />
          <span className="text-sm text-gray-500 hidden sm:block">
            Última actualización: {lastUpdate.toLocaleTimeString("es-ES")}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Título Principal */}
        <h1 className="text-5xl md:text-6xl font-bold text-center text-[#D42F2F] drop-shadow-sm">
          ¡FELIZ NAVIDAD!
        </h1>

        {/* Hero Section - Último Premio */}
        <Card className="bg-gradient-to-r from-[#D42F2F] to-[#B52828] text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iNCIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <CardContent className="py-8 relative">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-yellow-300">
                <Gift className="h-6 w-6" />
                <span className="text-sm font-medium uppercase tracking-wider">LOTERIA DE NAVIDAD</span>
              </div>

              {lastPrize ? (
                <div className="animate-pulse">
                  <div className="inline-flex items-center justify-center gap-4 bg-white/10 rounded-2xl px-8 py-4 backdrop-blur-sm">
                    <div className="bola-premiada w-20 h-20 flex items-center justify-center text-2xl font-bold rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 text-black shadow-lg">
                      {lastPrize.number}
                    </div>
                    <div className="text-left">
                      <p className="text-3xl font-bold">{formatCurrency(lastPrize.prize)}</p>
                      <p className="text-yellow-300 font-medium">{getPrizeType(lastPrize.prize)}</p>
                      <p className="text-sm text-white/70">
                        {lastPrize.timestamp.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-white/80">
                  <p className="text-xl">Esperando números premiados...</p>
                  <p className="text-sm mt-2">La página se actualiza automáticamente cada minuto</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resumen Total de la Peña */}
        <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Acumulado de la Peña</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalPena)}</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={refreshPrizes}
                disabled={isRefreshing}
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-100"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de la Peña */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-gray-800">Lotería de Navidad 2025 - Nuestra Peña</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Globero</TableHead>
                    <TableHead className="text-center font-semibold">Núm 1</TableHead>
                    <TableHead className="text-center font-semibold">Núm 2</TableHead>
                    <TableHead className="text-center font-semibold">Total</TableHead>
                    <TableHead className="font-semibold">Detalles del Premio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {globeroResults.map((result, index) => {
                    const hasPrize = result.total > 0;
                    
                    // Generar descripción de premios
                    let prizeDetails = "";
                    if (result.prize1 > 0) {
                      prizeDetails += `${result.num1}: ${getPrizeType(result.prize1)} (${formatCurrency(result.prize1)})`;
                    }
                    if (result.prize2 > 0) {
                      if (prizeDetails) prizeDetails += ". ";
                      prizeDetails += `${result.num2}: ${getPrizeType(result.prize2)} (${formatCurrency(result.prize2)})`;
                    }
                    if (!prizeDetails) {
                      prizeDetails = "Sin coincidencia con premios mayores ni pedrea.";
                    }
                    
                    return (
                      <TableRow
                        key={index}
                        className={hasPrize ? "bg-green-50 hover:bg-green-100" : "hover:bg-gray-50"}
                      >
                        <TableCell className="font-medium">
                          {hasPrize && <Trophy className="inline h-4 w-4 text-yellow-500 mr-2" />}
                          {result.globero}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`font-mono px-3 py-1 rounded-full ${result.prize1 > 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black font-bold shadow-md" : "bg-gray-100"}`}
                          >
                            {result.num1}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {result.num2 ? (
                            <span
                              className={`font-mono px-3 py-1 rounded-full ${result.prize2 > 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black font-bold shadow-md" : "bg-gray-100"}`}
                            >
                              {result.num2}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-center font-bold ${hasPrize ? "text-green-600 text-lg" : "text-gray-400"}`}
                        >
                          {hasPrize ? formatCurrency(result.total) : "0 €"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs">
                          {prizeDetails}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pb-4">
          <p>Los datos se actualizan automáticamente cada 30 segundos desde la API de El País</p>
          <p className="mt-1">© {new Date().getFullYear()} Camberas</p>
        </div>
      </main>

      <style>{`
        .bola-premiada {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(255, 215, 0, 0.6); }
          100% { transform: scale(1); box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
        }
      `}</style>
    </div>
  );
};

export default LoteriaNavidad;
