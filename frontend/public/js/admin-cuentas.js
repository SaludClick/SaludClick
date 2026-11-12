import {checkAuthGuard,getCurrentUser} from './auth.js';
import {paginaInicio} from './roles.js';
if(checkAuthGuard())location.replace(Number(getCurrentUser()?.rol_id??getCurrentUser()?.rol)===1?'/pages/admin.html#usuarios':paginaInicio(getCurrentUser()));
