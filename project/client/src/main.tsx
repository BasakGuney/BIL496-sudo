import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./app/App";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Bilinmeyen bir hata oluştu." };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#05060f] px-6">
          <div className="max-w-xl w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <h1 className="text-xl font-bold text-white mb-2">Arayüz Başlatılamadı</h1>
            <p className="text-sm text-red-200 break-words">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
