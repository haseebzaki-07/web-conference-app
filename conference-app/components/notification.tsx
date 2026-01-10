"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface NotificationProps {
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
  onClose: () => void;
}

export function Notification({
  message,
  type = "info",
  duration = 3000,
  onClose,
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    info: "bg-blue-600",
    success: "bg-green-600",
    warning: "bg-yellow-600",
    error: "bg-red-600",
  }[type];

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-3 min-w-[300px] max-w-md animate-in slide-in-from-top-2 fade-in`}
    >
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className="hover:bg-white/20 rounded p-1 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
