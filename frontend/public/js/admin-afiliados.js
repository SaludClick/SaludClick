import { checkAuthGuard } from '/js/auth.js';

// This independent administrative workflow has been retired.
// The shared policy denies this page for every role and redirects to its home.
checkAuthGuard();
