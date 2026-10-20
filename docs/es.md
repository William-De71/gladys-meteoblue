# Meteoblue

## Presentación

Esta integración convierte la **API Forecast de meteoblue** en un proveedor meteorológico de Gladys. Una vez instalada, la tarjeta meteorológica del panel y el asistente conversacional («¿qué tiempo hará mañana?») la usan en lugar del servicio OpenWeather integrado.

Ofrece:

- el **tiempo de la hora actual**: temperatura, sensación térmica, humedad, presión, viento, índice UV, día o noche, salida y puesta del sol;
- las **previsiones**: 24 horas y los 7 días de meteoblue, con la **fiabilidad** que meteoblue da a cada día (cuánto coinciden sus modelos);
- tres **activadores de escena**: lluvia prevista en las próximas 3 horas, helada prevista en las próximas 12 horas, créditos a punto de agotarse;
- tres **acciones de escena**, cuatro **widgets del panel** y el **meteograma** de meteoblue (opcional).

meteoblue (Basilea, Suiza) combina muchos modelos meteorológicos y los corrige con estaciones, radar y satélite cercanos. Todo pasa por los servidores de meteoblue (solo nube), con **su propia clave API**: la prueba gratuita de la Weather API da 10 millones de créditos durante un año, para uso no comercial, y la integración los reparte ella misma a lo largo del año.

meteoblue no publica avisos oficiales en esta API: el activador de alerta meteorológica de Gladys permanece en silencio con este proveedor. Los activadores de lluvia y helada de la integración son previsiones, no avisos oficiales.

> Esta integración aún no se ha probado con una clave API real: sigue al pie de la letra la referencia de la API de meteoblue. Informe de cualquier problema.

## Requisitos

- Gladys 5.2.0 o posterior.
- Una vivienda con ubicación (Configuración → Viviendas): la previsión de cada vivienda con ubicación se vigila para los activadores de escena.
- Una cuenta meteoblue con acceso a la **Weather API** (basta la prueba gratuita), para uso no comercial.

## Configuración

### 1. Una cuenta meteoblue y su clave gratuita

1. Cree una cuenta gratuita en [meteoblue.com](https://www.meteoblue.com/es/user/login/index) e inicie sesión.
2. Pulse el icono de la cuenta (arriba a la derecha) → **Account overview** → **Weather API**: la prueba gratuita empieza al momento, por un año, con 10 millones de créditos. Usted confirma un uso no comercial.
3. Copie la **clave API** que aparece. No se admiten las claves que exigen solicitudes firmadas (un secreto compartido).

Los pasos son los de la [documentación de meteoblue](https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview). Se pueden comprar créditos más adelante (200 € por 200 millones en el momento de escribir, [precios](https://content.meteoblue.com/en/business-solutions/weather-apis/pricing)).

### 2. Créditos y actualización

meteoblue cuenta **créditos**, no llamadas ([referencia de la API Forecast](https://my.meteoblue.com/packages/redoc)). Lo que gasta la integración:

| Llamada                                                       | Créditos | Con los 10 millones de créditos gratuitos                       |
| ------------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| Actualización de la previsión (por horas + 7 días, 1 llamada) | 8000     | unas 3 al día para una vivienda, más o menos cada 7 h           |
| Imagen del meteograma (opcional)                              | 16 000   | conservada 24 h = 5,8 millones al año, la mitad del presupuesto |
| «Probar la clave API»                                         | 8000     | a petición                                                      |

La integración cuenta lo que costó cada respuesta (meteoblue lo indica en una cabecera), guarda el contador en `/data` y **reparte los créditos restantes en lo que queda del año de la clave**: el intervalo de actualización se calcula, nunca más corto que el mínimo «Actualizar como mucho cada». Una reserva del 2 % queda para el botón de prueba. Cada vivienda con ubicación se actualiza por su cuenta: dos viviendas se actualizan la mitad de veces. Las previsiones se guardan en `/data`: un reinicio de Gladys no cuesta nada. Agotados los créditos del año, no sale ninguna llamada hasta el siguiente año de clave, y la última previsión se sirve mientras cubra la hora actual (7 días).

### 3. En Gladys

1. Integraciones → Meteoblue → Configuración.
2. Pegue la **clave API**. Introduzca el **inicio del año de la clave** si lo conoce (el día en que activó la Weather API); si no, se toma el primer día de uso.
3. Guarde y pulse **Probar la clave API**: lee ahora la previsión de su primera vivienda (8000 créditos) y muestra los créditos usados y el intervalo de actualización que permiten.

| Campo                            | Por defecto | Función                                                      |
| -------------------------------- | ----------- | ------------------------------------------------------------ |
| Clave API                        | —           | Su clave de meteoblue, guardada como secreto                 |
| Créditos por año de clave        | 10 000 000  | Auméntelo tras comprar créditos; nunca se supera             |
| Inicio del año de la clave       | vacío       | AAAA-MM-DD; vacío = el primer día de uso de la clave         |
| Actualizar como mucho cada (min) | 60          | 30 a 1440: un mínimo, los créditos suelen decidir            |
| Mostrar el meteograma            | no          | La imagen del meteograma de 5 días, 16 000 créditos cada una |
| Conservar un meteograma (horas)  | 24          | 3 a 168: una imagen solo se pide cuando alguien la mira      |

## Uso

### Tarjeta meteorológica y asistente

Nada que hacer: la tarjeta meteorológica del panel usa este proveedor. Si hay varios proveedores meteorológicos instalados, fije uno en los ajustes de la tarjeta. Con el meteograma activado, la tarjeta lo ofrece como imagen del proveedor. meteoblue cubre el mundo entero; la previsión de una vivienda se divide en días en la zona horaria de Gladys.

### Widgets

![Ilustración generada de los cuatro widgets — previsión 7 días, próximas horas, meteograma, créditos — no es una captura de pantalla](https://raw.githubusercontent.com/William-De71/gladys-meteoblue/main/docs/assets/widgets.es.png)

- **Previsión 7 días**: 3, 5 o 7 días con los pictogramas de meteoblue, máxima y mínima, cielo, probabilidad de precipitación; toque un día para ver la cantidad y las horas de precipitación, el viento, el índice UV, la fiabilidad y las horas del sol. Un día poco fiable y sin lluvia recibe una insignia.
- **Próximas horas**: una curva de las próximas 12, 24 o 48 horas: temperatura y sensación térmica, precipitación o viento.
- **Meteograma**: el meteograma de 5 días de meteoblue (temperatura, nubes, precipitación, viento), una vez activado en la configuración.
- **Créditos meteoblue**: los créditos usados y restantes en este año de clave, el intervalo de actualización que permiten, los días restantes y la última llamada.

Los widgets de previsión tienen un ajuste **Vivienda** (vacío para la primera vivienda con ubicación), citan su fuente y enlazan a la página de meteoblue del mismo lugar.

### Activadores de escena

- **Lluvia prevista pronto**: la previsión indica ahora precipitación en las próximas 3 horas (al menos 0,2 mm en una hora y una probabilidad de al menos el 40 % cuando meteoblue la da), tras una comprobación que no la indicaba. Filtros: vivienda, tipo (lluvia, nieve, aguanieve). Variables: vivienda, tipo, hora de inicio, minutos hasta el inicio, cantidad en 3 horas, probabilidad, cielo.
- **Helada prevista**: la previsión indica ahora 0 °C o menos en las próximas 12 horas. Variables: vivienda, hora de inicio, horas hasta el inicio, temperatura más baja y su hora.
- **Créditos meteoblue a punto de agotarse**: se ha usado el 75, 90 o 100 % de los créditos del año de la clave, cada nivel una vez por año de clave. Variables: nivel, créditos usados, por año, restantes, próximo año de clave.

La vigilancia mira la previsión en caché cada 10 minutos (sin gastar créditos). La primera comprobación tras un arranque sirve de referencia: una lluvia ya prevista no dispara nada. La previsión es tan reciente como permiten los créditos (como mucho unas 7 horas con la clave gratuita, para una vivienda).

### Acciones de escena

- **Obtener la previsión de un día**: de hoy a dentro de 6 días: máxima, mínima, cielo, cantidad y probabilidad de precipitación, fiabilidad, viento máximo, resumen.
- **Obtener el tiempo actual**: temperatura, sensación térmica, humedad, viento, cielo y resumen de la hora actual.
- **¿Va a llover?**: en las próximas 3 a 24 horas: sí o no, desde cuándo, lluvia o nieve, total, probabilidad máxima, resumen.

### Ejemplos de escenas

- Cuando haya **lluvia prevista pronto** (vivienda «Vivienda», tipo «Lluvia») → enviar «Recoja la ropa: `{{triggerEvent.data.kind}}` desde las `{{triggerEvent.data.start_time}}`» a su teléfono.
- Cuando haya **helada prevista** → cerrar la válvula de agua del jardín y enviar `{{triggerEvent.data.min_temperature}}` °C a las `{{triggerEvent.data.coldest_time}}`.
- Cada tarde a las 20:00 → **¿Va a llover?** (12 horas) → si no se prevé precipitación, poner en marcha el riego del jardín.

### Atribución y uso no comercial

La clave gratuita es para **uso no comercial** ([condiciones de meteoblue](https://content.meteoblue.com/en/about-us/legal/commercial-non-commercial-use)), que exige un enlace directo a meteoblue para el mismo lugar: cada widget de previsión cita a meteoblue y lleva ese enlace, y el meteograma conserva el logotipo de meteoblue. Los pictogramas meteorológicos son los de meteoblue, ofrecidos para uso libre con un enlace a su [página de pictogramas](https://docs.meteoblue.com/en/meteo/variables/pictograms); la integración los obtiene de meteoblue, nunca su navegador. Datos meteorológicos © meteoblue AG.

## Solución de problemas

- **«meteoblue rechazó la clave API (invalid)»**: la clave es incorrecta; cópiela de nuevo desde Account overview → Weather API.
- **«(missing)»**: no hay ninguna clave guardada en la configuración.
- **«el acceso de esta clave ha caducado»**: el año gratuito ha terminado; renuévelo o compre créditos en meteoblue.com.
- **«exige solicitudes firmadas»**: la clave está protegida por un secreto compartido, no admitido; use una clave sin firma.
- **«rechazó la solicitud por créditos o límite de frecuencia»**: el contador de meteoblue está agotado, o hay un límite diario fijado para la clave en su cuenta; mientras tanto se sirve la previsión en caché.
- **«Créditos del año de la clave agotados»**: se alcanzó el tope de la integración; aumente «Créditos por año de clave» tras una compra o espere al siguiente año de clave. La página de la cuenta meteoblue es la referencia (también cuenta otros usos de la clave).
- **La previsión parece antigua**: los créditos gratuitos permiten una actualización cada 7 horas aproximadamente para una vivienda; el widget «Créditos meteoblue» muestra el intervalo.
- **Sin tiempo para una vivienda**: no tiene ubicación en Gladys.
- Registros: Configuración → Supervisión → Meteoblue. La clave nunca aparece en ellos.
