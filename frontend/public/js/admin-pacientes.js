import {checkAuthGuard} from '/js/auth.js';
if(checkAuthGuard())location.replace('/pages/admin.html#usuarios');
