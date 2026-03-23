import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./components/Layout";
import NotFound from "@/pages/not-found";
import { LogProvider } from "./components/LogProvider";

import { AuthProvider, useAuth } from "./hooks/use-auth";
import Login from "./pages/Login";
import { Loader2 } from "lucide-react";

// Page Components (to be implemented)
import Dashboard from "./pages/Dashboard";
import LiveMonitor from "./pages/LiveMonitor";
import PromptEditor from "./pages/PromptEditor";
import CRMConfig from "./pages/CRMConfig";
import KnowledgeBase from "./pages/KnowledgeBase";
import ScheduleRules from "./pages/ScheduleRules";
import UsersManagement from "./pages/UsersManagement";
import CostsDashboard from "./pages/CostsDashboard";
import VTEXConfig from "./pages/VTEXConfig";
import ConversasConfig from "./pages/ConversasConfig";
import LiveChat from "./pages/LiveChat";

function Router() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          {/* Default to login if not authenticated */}
          {() => { setLocation("/login"); return null; }}
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {() => { setLocation("/"); return null; }}
      </Route>
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard}/>
            <Route path="/monitor" component={LiveMonitor}/>
            <Route path="/prompt" component={PromptEditor}/>
            <Route path="/crm" component={CRMConfig}/>
            <Route path="/knowledge" component={KnowledgeBase}/>
            <Route path="/schedule" component={ScheduleRules}/>
            <Route path="/users" component={UsersManagement}/>
            <Route path="/costs" component={CostsDashboard}/>
            <Route path="/vtex" component={VTEXConfig}/>
            <Route path="/conversas" component={ConversasConfig}/>
            <Route path="/livechat" component={LiveChat}/>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LogProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </LogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;