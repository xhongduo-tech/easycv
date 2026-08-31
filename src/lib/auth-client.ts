"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    phoneNumberClient(),
    twoFactorClient({ twoFactorPage: "/auth/two-factor" }),
    adminClient(),
  ],
});
