'use client';

import React, { createContext, useContext, useState } from 'react';

interface MobileSidebarContextType {
  isOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextType>({
  isOpen: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
});

export const MobileSidebarProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openSidebar = () => setIsOpen(true);
  const closeSidebar = () => setIsOpen(false);
  const toggleSidebar = () => setIsOpen((prev) => !prev);

  return (
    <MobileSidebarContext.Provider value={{ isOpen, openSidebar, closeSidebar, toggleSidebar }}>
      {children}
    </MobileSidebarContext.Provider>
  );
};

export const useMobileSidebar = () => useContext(MobileSidebarContext);
