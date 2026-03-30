"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/components/auth/auth-session-provider"

export function HomeSessionActions() {
  const { isPending, session } = useAuthSession()

  return (
    <div className="flex flex-wrap gap-3">
      {isPending ? (
        <Button size="lg" className="h-11 rounded-full px-5 text-sm" disabled>
          Verifying session...
        </Button>
      ) : (
        <Button asChild size="lg" className="h-11 rounded-full px-5 text-sm">
          <Link href={session ? "/admin/dashboard" : "/login"}>
            {session ? "Open Admin Dashboard" : "Sign In to Review"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}

      <Button
        asChild
        size="lg"
        variant="outline"
        className="h-11 rounded-full border-white/15 bg-white/6 px-5 text-sm text-white hover:bg-white/10"
      >
        <a href="http://localhost/api/v1/health/ready" target="_blank" rel="noreferrer">
          Check API Health
        </a>
      </Button>
    </div>
  )
}
