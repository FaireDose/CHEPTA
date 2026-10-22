# 2026-10-22: publishing 0.4.0 with trusted publishing

The release v0.4.0 failed twice at its last step, the upload to npm:
- first "E401 ... your authentication token seems to be invalid": the workflow still logged in with the one-day token
  of 0.3.0 (the `NPM_TOKEN` secret), and the trusted publisher on npmjs.com had expired. npm: "A newly created trusted
  publisher configuration must complete its first successful publish within 2 days" (docs.npmjs.com/trusted-publishers).
  The maintainer deleted it and made a new one (FaireDose, CHEPTA, publish.yml), and deleted the secret;
- then "ENEEDAUTH ... requires you to be logged in": no token any more, and the OpenID Connect login did not succeed.

Changed in `.github/workflows/publish.yml`: the token path is gone (the first upload is done); `setup-node` no longer
writes an `.npmrc` that logs in with `NODE_AUTH_TOKEN`; the step prints the Node and npm versions and runs npm with
`--loglevel verbose`, so a failed login says why. npm's docs name the first thing to check for ENEEDAUTH: every field
of the trusted publisher must match exactly, case included, the workflow file with its `.yml`.

The new trusted publisher must be used for a successful upload before 2026-10-24, 07:13 UTC, or it expires again.
