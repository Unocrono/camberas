# Capturas

Imágenes que van dentro de un slide (`"imagen"` en el JSON de contenido).
La ruta se escribe **relativa a la raíz del repo**:

```json
{ "pregunta": "…", "respuesta": "…", "imagen": "capturas/grupetta-perfil.png" }
```

El generador comprueba que el fichero existe antes de abrir el navegador,
así que una ruta mal escrita se ve al momento y no a mitad de la tanda.

Se colocan entre el titular y la explicación, a todo el ancho de la caja y
con las esquinas redondeadas. Escalan con el resto del bloque: si la
imagen es alta, el texto se encoge para dejarle sitio.

**Formato recomendado:** PNG, 1080 px de ancho o más, y proporción
apaisada o cuadrada. Una imagen muy vertical se lleva el slide entero y
deja el texto en mínimos.
