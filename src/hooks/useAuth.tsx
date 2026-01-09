import { useState, useEffect, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const rolesCheckedForUserId = useRef<string | null>(null);

  const checkUserRoles = useCallback(async (userId: string) => {
    // Prevent duplicate checks for same user
    if (rolesCheckedForUserId.current === userId) {
      return;
    }
    rolesCheckedForUserId.current = userId;

    try {
      setRolesLoaded(false);

      const [adminResult, organizerResult] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "organizer" }),
      ]);

      setIsAdmin(adminResult.data || false);
      setIsOrganizer(organizerResult.data || false);
    } catch (error) {
      console.error("Error checking user roles:", error);
      setIsAdmin(false);
      setIsOrganizer(false);
    } finally {
      setRolesLoaded(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        checkUserRoles(session.user.id);
      } else {
        setRolesLoaded(true);
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!mounted) return;
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
        
        if (currentSession?.user) {
          // Reset role check ref if different user
          if (rolesCheckedForUserId.current !== currentSession.user.id) {
            rolesCheckedForUserId.current = null;
            setTimeout(() => {
              if (mounted) {
                checkUserRoles(currentSession.user.id);
              }
            }, 0);
          }
        } else {
          rolesCheckedForUserId.current = null;
          setIsAdmin(false);
          setIsOrganizer(false);
          setRolesLoaded(true);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkUserRoles]);

  const signOut = async () => {
    rolesCheckedForUserId.current = null;
    setIsAdmin(false);
    setIsOrganizer(false);
    setRolesLoaded(false);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Even if server logout fails (session_not_found), clear local state
      console.warn("Server logout failed, clearing local session:", error);
    }
    // Always clear local state regardless of server response
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, signOut, isAdmin, isOrganizer, rolesLoaded };
};
