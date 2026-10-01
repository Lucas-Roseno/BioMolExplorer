"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function ConditionalLayoutElement({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hiddenPaths = ["/login", "/setup", "/workspaces", "/3d-demo"];
  
  if (hiddenPaths.includes(pathname)) {
    return null;
  }

  return <>{children}</>;
}
