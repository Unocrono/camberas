import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/races" element={<Races />} />
          <Route path="/race/:id" element={<RaceDetail />} />
          <Route path="/race/:id/regulation" element={<RaceRegulation />} />
          <Route path="/race/:id/results" element={<RaceResults />} />
          <Route path="/race/:id/live" element={<LiveResults />} />
          <Route path="/race/:id/gps" element={<LiveGPSTracking />} />
          <Route path="/race/:id/tracker" element={<RunnerGPSTracker />} />
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
