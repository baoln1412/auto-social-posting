# auto-social-posting

## Facebook / Social-Media Post Compliance (ALL post-generating work here)

For ANY content posted to Facebook/Instagram/Meta (not just immigration content), the
**Meta Community Standards are the compliance standard to check and comply with BEFORE
generating a post**: https://transparency.meta.com/policies/community-standards/

Key facts to apply:
- **Bans come from Community Standards (organic content), NOT the monetization/ads
  policies.** A post can be demonetized yet perfectly allowed to stay up — don't
  confuse the two. Monetization eligibility is a separate, lower-stakes layer.
- **News reporting / awareness / condemnation is a protected carve-out** across the
  sensitive standards (Human Exploitation, Coordinating Harm, Dangerous Orgs).
  Reporting on a crime ≠ facilitating it.
- **Every sensitive post (trafficking, smuggling, drugs, weapons, crime) must:
  (1) cite a source, (2) read as report/condemnation — never an offer or how-to,
  (3) contain zero contact info, prices, or routes.** Fail any one → hold the post.
- **Criticize policy, never dehumanize people.** Migrants/refugees/ethnic/national/
  religious groups are protected under Hateful Conduct; attack the policy, not the
  group. No "invasion/flood/vermin"-style framing.
- **Accuracy protects reach:** false claims get fact-check labels + down-ranking
  even when not removed.

When building a post-generation pipeline, bake a self-check against these into the
generation step (screen each draft against the 3-part rule above before saving).

The marketing skills (`.claude/skills/`, from coreyhaines31/marketingskills) — especially
`social`, `ads`, `launch` — must run their output through this compliance gate before a
draft is saved.
