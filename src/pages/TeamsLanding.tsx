/**
 * Equipos y clubes — landing pública (marketing), hermana de /organizers.
 * Explica la inscripción en lote y el descuento por equipos, y lleva a la
 * herramienta (/equipo) con el acceso embebido al final para quien aún no
 * tiene cuenta. Aquí NO hay lógica de negocio: el precio y el descuento
 * los calcula siempre el servidor al inscribir.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  ListChecks,
  CreditCard,
  TicketPercent,
  ArrowRight,
  CheckCircle,
  UserPlus,
  Flag,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { TeamAccessCard } from "@/components/teams/TeamAccessCard";
import { useAuth } from "@/hooks/useAuth";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const ventajas = [
  {
    icon: ListChecks,
    title: "Tu equipo, guardado",
    description:
      "Metes a tus corredores una vez y se quedan. Nombre, DNI, fecha de nacimiento: no vuelves a teclearlos carrera tras carrera.",
  },
  {
    icon: Users,
    title: "Inscripción en lote",
    description:
      "Marcas quién va, completas las fichas y los inscribes a todos de una vez. Se acabó el formulario uno por uno.",
  },
  {
    icon: CreditCard,
    title: "Un solo pago",
    description:
      "Pagas tú por todo el equipo en un único cargo con tarjeta. Nada de perseguir a quince personas para que paguen su parte.",
  },
  {
    icon: TicketPercent,
    title: "Descuento por equipos",
    description:
      "Cuando el organizador lo activa, cuantos más seáis menos paga cada uno. Se aplica solo, sin pedir nada a nadie.",
  },
];

const pasos = [
  {
    icon: UserPlus,
    title: "1. Crea tu equipo",
    description:
      "Con tu cuenta de Camberas. Añades a los componentes con sus datos; los que ya corren con nosotros se vinculan solos por email o DNI.",
  },
  {
    icon: Flag,
    title: "2. Inscríbelo en una carrera",
    description:
      "Eliges carrera y recorrido, marcas a quién llevas y completas lo que pida el formulario. El total sale con el descuento ya aplicado.",
  },
  {
    icon: CreditCard,
    title: "3. Paga una vez",
    description:
      "Un cargo por todo el lote. Al confirmarse, cada corredor recibe su dorsal y a ti te llega el resumen por email.",
  },
];

const detalles = [
  {
    icon: Repeat,
    title: "El equipo no caduca",
    description:
      "No es una inscripción, es tu club. Sirve para esta carrera, para la siguiente y para la temporada que viene.",
  },
  {
    icon: ShieldCheck,
    title: "No hace falta que todos tengan cuenta",
    description:
      "Puedes gestionar tú a quien no use la app. Los que sí tienen cuenta ven sus inscripciones en su perfil como siempre.",
  },
];

const TeamsLanding = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero */}
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
              Equipos y clubes
            </motion.span>

            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              variants={fadeInUp}
            >
              Inscribe a todo tu club{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                de una vez
              </span>
            </motion.h1>

            <motion.p
              className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
              variants={fadeInUp}
            >
              Guarda a tus corredores una sola vez, inscríbelos en lote y paga por todos
              con un único cargo. Con descuento por equipos cuando el organizador lo
              activa.
            </motion.p>

            <motion.div className="flex flex-col sm:flex-row gap-4 justify-center" variants={fadeInUp}>
              <Button asChild size="lg" className="text-lg px-8 py-6">
                <Link to="/equipo">
                  {user ? "Ir a mi equipo" : "Crear mi equipo"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                <Link to="/races?filter=upcoming">Ver carreras</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Se acabó inscribir a la gente uno por uno
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Lo que antes era una tarde de formularios y transferencias, ahora son cinco
              minutos
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {ventajas.map((v, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <Card className="h-full group hover:shadow-lg hover:border-primary/50 transition-all duration-300 hover:-translate-y-1">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <v.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{v.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">{v.description}</CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Cómo funciona</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tres pasos, y el segundo y el tercero se repiten en cada carrera
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {pasos.map((p, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                      <p.icon className="h-6 w-6 text-secondary" />
                    </div>
                    <CardTitle className="text-lg">{p.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">{p.description}</CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mt-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {detalles.map((d, index) => (
              <motion.div key={index} className="flex gap-4 items-start" variants={fadeInUp}>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <d.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{d.title}</h3>
                  <p className="text-muted-foreground">{d.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Descuento por equipos: ejemplo */}
      <section className="py-12 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <TicketPercent className="h-10 w-10 mx-auto mb-4 opacity-90" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Cuantos más seáis, menos paga cada uno
            </h2>
            <p className="text-primary-foreground/85 text-lg">
              Cada organizador decide sus tramos: por ejemplo, "a partir de 5 corredores,
              un 10% menos por cabeza". Al inscribir el lote se aplica solo — nadie tiene
              que pedir nada ni teclear ningún código. Y si además tienes un cupón, se
              suma al descuento de equipo.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Acceso */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Empieza ahora</h2>
              <p className="text-muted-foreground text-lg">
                Es gratis: solo pagáis las inscripciones de la carrera, como siempre.
              </p>
            </div>

            <Card className="border-2 border-secondary/60">
              <CardContent className="pt-6">
                {user ? (
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Ya tienes la sesión iniciada</span>
                    </div>
                    <Button asChild size="lg" className="w-full">
                      <Link to="/equipo">
                        <Users className="mr-2 h-5 w-5" />
                        Ir a mi equipo
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <TeamAccessCard redirectTo="/equipo" />
                )}
              </CardContent>
            </Card>

            <p className="text-center text-sm text-muted-foreground mt-6">
              ¿Organizas la carrera en vez de correrla?{" "}
              <Link to="/organizers" className="underline text-foreground">
                Esta es tu página
              </Link>
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TeamsLanding;
