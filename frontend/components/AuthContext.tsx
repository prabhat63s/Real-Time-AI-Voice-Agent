"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const checkAuth = () => {
            const token = Cookies.get("auth_token");
            if (token) {
                setIsAuthenticated(true);
                if (pathname === "/login") {
                    router.push("/");
                }
            } else {
                setIsAuthenticated(false);
                if (pathname !== "/login") {
                    router.push("/login");
                }
            }
            setIsLoading(false);
        };

        checkAuth();
    }, [pathname, router]);

    const login = (token: string) => {
        Cookies.set("auth_token", token, { expires: 1 });
        setIsAuthenticated(true);
        router.push("/");
    };

    const logout = () => {
        Cookies.remove("auth_token");
        setIsAuthenticated(false);
        router.push("/login");
    };

    // Prevent rendering of protected content until auth is checked
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">Loading...</div>;
    }

    // If not authenticated and not on login page, don't render children (we are redirecting)
    if (!isAuthenticated && pathname !== "/login") {
        return null;
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
