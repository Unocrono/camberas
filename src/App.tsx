import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from '@capacitor/core';
import Index from "./pages/Index";
import Races from "./pages/Races";
import RaceDetail from "./pages/RaceDetail";
import RaceRegulation from "./pages/RaceRegulation";
import RaceResults from "./pages/RaceResults";
import LiveResults from "./pages/LiveResults";
import LiveGPSTracking from "./pages/LiveGPSTracking";
import RunnerGPSTracker from "./pages/RunnerGPSTracker";
import TimingShop from "./pages/TimingShop";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import TrainingPlan from "./pages/TrainingPlan";
import AiSupportChat from "./pages/AiSupportChat";
import SupportChat from "./pages/SupportChat";
import Faqs from "./pages/Faqs";
import OrganizerProfile from "./pages/OrganizerProfile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Roadbook from "./pages/Roadbook";
import BibDesignerPage from "./pages/BibDesignerPage";
import Contact from "./pages/Contact";
import Support from "./pages/Support";
import TimingApp from "./pages/TimingApp";
import GPSTrackerApp from "./pages/GPSTrackerApp";
import Help from "./pages/Help";
import OrganizerGuide from "./pages/OrganizerGuide";
import Legal from "./pages/Legal";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";

const queryClient = new QueryClient();

// Detectar si estamos en una app nativa (Android/iOS)
const isNativePlatform = Capacitor.isNativePlatform();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* En app nativa, redirigir "/" a "/track" */}
          <Route path="/" element={isNativePlatform ? <Navigate to="/track" replace /> : <Index />} />
          <Route path="/races" element={<Races />} />
          <Route path="/race/:id" element={<RaceDetail />} />
          <Route path="/race/:id/regulation" element={<RaceRegulation />} />
          <Route path="/race/:id/results" element={<RaceResults />} />
          <Route path="/race/:id/live" element={<LiveResults />} />
          <Route path="/race/:id/gps" element={<LiveGPSTracking />} />
          <Route path="/race/:id/tracker" element={<RunnerGPSTracker />} />
          {/* Friendly URL routes with race slug */}
          <Route path="/roadbook/:roadbookId" element={<Roadbook />} />
          <Route path="/timing-shop" element={<TimingShop />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/organizer" element={<OrganizerDashboard />} />
          <Route path="/organizer/bib-designer" element={<BibDesignerPage />} />
          <Route path="/training-plan" element={<TrainingPlan />} />
          <Route path="/support-chat" element={<AiSupportChat />} />
          <Route path="/admin/support" element={<SupportChat />} />
          <Route path="/faqs" element={<Faqs />} />
          <Route path="/organizer-profile" element={<OrganizerProfile />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/support" element={<Support />} />
          <Route path="/timing" element={<TimingApp />} />
          <Route path="/track" element={<GPSTrackerApp />} />
          <Route path="/ayuda" element={<Help />} />
          <Route path="/guia-organizador" element={<OrganizerGuide />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/cookies" element={<Cookies />} />
          {/* URL amigable con slug de carrera - DEBE estar antes del catch-all */}
          <Route path="/:slug" element={<LiveResults />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
