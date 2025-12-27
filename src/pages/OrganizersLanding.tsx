import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ClipboardList, 
  Timer, 
  MapPin, 
  BarChart3, 
  CheckCircle, 
  Users, 
  Zap, 
  Shield,
  ArrowRight,
  Shirt,
  FileCheck,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const advantages = [
  {
    icon: ClipboardList,
    title: "Gestión de Inscripciones",
    description: "Formularios personalizables, pagos seguros y gestión automática de listas de espera. Todo centralizado."
  },
  {
    icon: Shirt,
    title: "Dorsales, Tallas, Seguros...",
    description: "Control completo de dorsales, tallas de camisetas, seguros deportivos y documentación requerida."
  },
  {
    icon: MapPin,
    title: "Control GPS Organización",
    description: "Seguimiento en tiempo real de motos, vehículos de organización y puntos de avituallamiento."
  },
  {
    icon: BarChart3,
    title: "Analíticas en Tiempo Real",
    description: "Panel de control con estadísticas de inscripciones, demografía y recaudación actualizada al instante."
  }
];

const whyChooseUs = [
  {
    icon: Zap,
    title: "Fácil de Usar",
    description: "Interfaz intuitiva diseñada para organizadores. Publica tu carrera en minutos, no en días."
  },
  {
    icon: Shield,
    title: "Soporte Especializado",
    description: "Equipo de soporte técnico con experiencia en eventos deportivos. Estamos contigo el día de la carrera."
  },
  {
    icon: Timer,
    title: "Cronometraje Profesional",
    description: "Integración nativa con sistemas de cronometraje. Resultados en vivo para corredores y familiares."
  },
  {
    icon: Trophy,
    title: "Clasificaciones Automáticas",
    description: "Generación automática de clasificaciones por categoría, género y edad. Sin trabajo manual."
  }
];

const stats = [
  { value: "+500", label: "Carreras gestionadas" },
  { value: "+50K", label: "Corredores inscritos" },
  { value: "99.9%", label: "Uptime garantizado" },
  { value: "24/7", label: "Soporte técnico" }
];

const OrganizersLanding = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.span 
              className="inline-block px-4 py-2 rounded-full bg-secondary/10 text-secondary font-medium text-sm mb-6"
              variants={fadeInUp}
            >
              Plataforma para Organizadores
            </motion.span>
            
            <motion.h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              variants={fadeInUp}
            >
              Lleva tu carrera al{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                siguiente nivel
              </span>
            </motion.h1>
            
            <motion.p 
              className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
              variants={fadeInUp}
            >
              Gestiona inscripciones, cronometraje, seguimiento GPS y comunicación con corredores. 
              Todo en una sola plataforma diseñada por y para organizadores.
            </motion.p>
            
            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center"
              variants={fadeInUp}
            >
              <Button asChild size="lg" className="text-lg px-8 py-6">
                <Link to="/auth/organizer">
                  Crear mi primer evento
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                <Link to="/contact">
                  Contactar con ventas
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Ventajas Clave */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Todo lo que necesitas para tu evento
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Herramientas profesionales pensadas para cada aspecto de la organización
            </p>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {advantages.map((advantage, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <Card className="h-full group hover:shadow-lg hover:border-primary/50 transition-all duration-300 hover:-translate-y-1">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <advantage.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{advantage.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {advantage.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Por qué elegir Camberas */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                ¿Por qué elegir Camberas?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Más de 500 organizadores confían en nosotros para gestionar sus eventos. 
                Nuestra plataforma está diseñada específicamente para carreras de trail, running y MTB.
              </p>
              
              <div className="space-y-4">
                {whyChooseUs.map((item, index) => (
                  <motion.div 
                    key={index}
                    className="flex gap-4 items-start"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{item.title}</h3>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden">
                <div className="p-8 text-center">
                  <Users className="h-24 w-24 mx-auto mb-4 text-primary/60" />
                  <p className="text-lg font-medium text-muted-foreground">
                    Panel de control intuitivo para organizadores
                  </p>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 bg-card rounded-xl shadow-lg p-4 border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Soporte Premium</p>
                    <p className="text-xs text-muted-foreground">Respuesta en &lt;2h</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {stats.map((stat, index) => (
              <motion.div 
                key={index} 
                className="text-center"
                variants={fadeInUp}
              >
                <div className="text-3xl md:text-4xl font-bold mb-2">{stat.value}</div>
                <div className="text-primary-foreground/80">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Precios */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Precios transparentes
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Sin costes ocultos. Solo pagas por inscripción completada.
            </p>
          </motion.div>

          <motion.div 
            className="max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="border-2 border-primary/20">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">Plan Organizador</CardTitle>
                <CardDescription className="text-lg">
                  Todo incluido, sin límites
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="text-center mb-8">
                  <span className="text-5xl font-bold">0€</span>
                  <span className="text-muted-foreground ml-2">cuota mensual</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {[
                    "Inscripciones ilimitadas",
                    "Cronometraje integrado",
                    "Seguimiento GPS",
                    "Soporte técnico 24/7",
                    "Resultados en tiempo real",
                    "Comunicación con corredores",
                    "Analíticas avanzadas",
                    "Gestión de dorsales"
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/50 rounded-lg p-4 mb-6">
                  <p className="text-center">
                    <span className="font-semibold">Comisión por inscripción:</span>{" "}
                    <span className="text-2xl font-bold text-secondary">4%</span>{" "}
                    <span className="text-muted-foreground">+ gastos de pasarela de pago</span>
                  </p>
                </div>

                <Button asChild size="lg" className="w-full text-lg py-6">
                  <Link to="/auth/organizer">
                    Empezar gratis
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              ¿Listo para transformar tu evento?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Únete a cientos de organizadores que ya confían en Camberas. 
              Crea tu cuenta hoy y publica tu primera carrera en minutos.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-lg px-8 py-6">
                <Link to="/auth/organizer">
                  Registrarme como Organizador
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                <Link to="/organizer-guide">
                  Ver guía completa
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default OrganizersLanding;
