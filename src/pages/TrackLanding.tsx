import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const TrackLanding = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <Navbar />
    <main className="flex-1 container mx-auto px-4 py-16 max-w-2xl text-center">
      <h1 className="text-4xl font-bold mb-4">Seguimiento GPS</h1>
      <p className="text-lg text-muted-foreground mb-8">
        La app de seguimiento GPS de Camberas ahora es una aplicación nativa
        independiente. Muy pronto estará disponible para descarga.
      </p>
    </main>
    <Footer />
  </div>
);

export default TrackLanding;