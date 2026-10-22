// Fail closed. No environment override. Re-enabling requires a reviewed code change.
throw new Error('FORMA_IMAGE_PROCESSING_BLOCKED: image preparation is disabled because the pinned native chain includes vulnerable libheif. Do not install the legacy tool dependencies. A patched chain and separate security review are required.');
