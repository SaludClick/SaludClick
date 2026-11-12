import {useEffect,useState} from 'react';

export default function AdministrativeSupport(){
  const [questions,setQuestions]=useState([]);
  const [destination,setDestination]=useState('/login.html');
  const [available,setAvailable]=useState(false);
  useEffect(()=>{
    let active=true;
    import('../../public/js/auth.js').then(async auth=>{
      const user=auth.getCurrentUser();
      const role=Number(user?.rol_id??user?.rol);
      if(![1,2].includes(role)||!auth.getToken())return;
      if(active)setDestination(role===1?'/pages/admin.html#mensajes':'/pages/soporte.html#mensajes');
      try{
        const {apiFetch}=await import('../../public/js/api.js');
        const response=await apiFetch('/api/administrativo/faq');
        if(active){setQuestions(response.preguntas);setAvailable(true);}
      }catch{/* The existing local assistant remains available during maintenance. */}
    }).catch(()=>{});
    return()=>{active=false;};
  },[]);
  return <section className="vitalix-administrative-support" aria-label="Atención humana administrativa">
    <h2>Atención de Administración</h2>
    <p>Para cuentas, acceso y consultas administrativas, puedes abrir una conversación con el equipo. El envío se confirma en la bandeja; este botón no envía tus mensajes de VITALIX.</p>
    <a className="btn-primary" href={destination}>Continuar con atención humana</a>
    {available&&questions.length>0&&<div><h3>Preguntas frecuentes de Administración</h3>{questions.map((q,i)=><details key={i}><summary>{q.pregunta}</summary><p>{q.respuesta}</p></details>)}</div>}
    <p>Para consultas médicas o farmacéuticas, contacta al profesional o rol competente. No compartas contraseñas ni datos clínicos.</p>
  </section>;
}
