# Retirados

Contenido que ya no se publica pero se guarda por si vuelve.

`expandir()` en generar-carrusel.js lista solo los `.json` sueltos de la
carpeta que le pases, así que lo de aquí dentro **no se regenera** con
`node generar-carrusel.js content`. Para sacar uno, pásale la ruta:

```sh
node generar-carrusel.js content/retirados/manual-grupetta.json
```

- **manual-grupetta.json** — «Dejad de contar cabezas», la pieza suelta
  previa a la serie. La sustituyen los carruseles 1, 2 y 3 de grupetta,
  que cuentan lo mismo con más sitio.
- **faq-organizadores.json** — «Montar tu carrera en Camberas», FAQ suelta
  de cuando se probaba la herramienta: sin gancho y solapando con el
  carrusel 2 de organizadores, que cuenta lo mismo con recorrido.
