export type SessionResponse = {
  user: {
    id: string
    email: string
    displayName: string
    status: string
  }
  account: {
    id: string
    slug: string
    name: string
    accountType: string
    roleCode: string
  }
  session: {
    expiresAt: string
  }
}

export type ModuleListItem = {
  id: string
  slug: string
  title: string
  status: string
  latestVersionNo: number | null
  latestVersionState: string | null
  currentReleasePublishedAt: string | null
}

export type ModuleListResponse = {
  total: number
  items: ModuleListItem[]
}
