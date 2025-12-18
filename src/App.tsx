import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

// Routes
import Home from "@/routes/Home";
import AssignmentRunner from "@/routes/AssignmentRunner";
import ReportViewer from "@/routes/ReportViewer";
import About from "@/routes/About";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppLayout>
            <Home />
          </AppLayout>
        }
      />
      <Route
        path="/a/:assignmentId"
        element={
          <AppLayout>
            <AssignmentRunner />
          </AppLayout>
        }
      />
      <Route
        path="/r/:reportId"
        element={
          <AppLayout>
            <ReportViewer />
          </AppLayout>
        }
      />
      <Route
        path="/about"
        element={
          <AppLayout>
            <About />
          </AppLayout>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
