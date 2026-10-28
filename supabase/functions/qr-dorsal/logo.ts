/**
 * El logo de Camberas para el centro del QR de los correos (qr-dorsal): el
 * mismo /logo-track.png que pone qrConLogo en la web, a 128 px e incrustado
 * aquí para que la función no dependa de que el sitio esté accesible.
 *
 * Norma de la casa (28-oct-2026): TODOS los QR llevan el logo de Camberas.
 *
 * El PNG se generó con PIL (RGBA de 8 bits, sin entrelazar). El
 * descodificador de abajo entiende cualquier PNG RGB/RGBA de 8 bits sin
 * entrelazar, con los cinco filtros de fila. Sin imports: se puede probar
 * desde Node (DecompressionStream es global en Node 18+ y en Deno).
 */

export const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAgaElEQVR42u1dh5dUVZ6uP8CAoCCxOtE5567qCHQ33U2WNApNFCQI" +
  "JkAUlSChE1Fcd2bOBmfPmd09O2dm0HFUREBgdGZnwzk7oxLMJBVRQeIIv73f79376lZ1VXV1U68CVJ9zT1XXe6/eq/t995fvvTaK" +
  "sr/r16/Tjz/+yM3b3/kfLtAHh4/Ra2/spRd++s/05HObqHneY9R430xy1t5Huc4GSikYRglZFWTPcHJLyK7gz3DMWTeRz8U1Tz7X" +
  "Ir7jZf6uv7x/mL4/d97rPdXz4Nmi7c8WPaBf4+b5+ceffE6/fuUNWr1hC02ZuZhKho2jxOxK6pdYQH3sudRbtLvj86mv+L//0CIa" +
  "mFJCg1LLaHBaGQ1Jd3DDe3yGYzgH5+IaXIvvwP/xgjCFVWNoUvNCvhfueezjTzuBrp4zWsgQ0QS4du1ap5H+/ffnaPfbB+ipNW00" +
  "fPQDFJ9ZTr0GZdHtAzKp95AcujepiAYJQDGy48QxHI/j5jRHvALes6njONftWvEZSHKvIAdIcYe4F+6Jc0eIZ8CzvCme6TvxbJ6S" +
  "Ab8hRoBu/v0oOk3vuAsXL9Ibe/bTkmWrKb+iifrE5dGdAoC+CQUMDEYnGsDyB/CNNpNU8n64N54Bz3K3eKa88kZ6eNlz9Pvd++jC" +
  "hYvuRI5QIkQUATxFJ3T5upbtVDpsvAA9l0dd/6HFJggG4A7LAO+SEKLpz9I/uZifEWoDqmjtpm301w+OdJIKMQJ4GfG6ytyz7xDN" +
  "mP84d/KdgzJZrKuOtnKEB0NCsHQQzwp1cefATJYSzfMepbf2HXTZLvI33/IEuOYh6l99/W0aPWUu3SMMsLuEPkenJkQ46P7IgGfH" +
  "e9gmd8fn0ejJc+iV37/l8/ffMgRQrpw+4scI4HsPyWVdqkZ7tIHuqykVARKADKMmzaa39h50Uwvh8hps4RD36g++9XThb8PlAvDx" +
  "WYbVfbMA79kUsdXvnbngCTcbIRxqwRaOUX/x4iVa3/YCd8pdQ7JNl+tmBb6TRJDuJX47/kdfwNMJhzSwhUrXq7/9B/9IVY1T6A4Y" +
  "SOllN5Wo74lqGJzm4L6oHDmZ9h5412ufRTUB1Ki/cvUqrd64le4RfjN854Tsyqg07iwxFkVfINp4T0I+Pbt+M12+ciVkLqMtFOC/" +
  "/+FRqh/fzExXwZRbHXhv9gH6Bn1UN24691koSGCzSt8rEYaYORiOQA5eY2D7b0Zf5XGC6le7Xpfq4LpldoHNSn3/fOsOjp0PTCm9" +
  "pXV9T2yDgamlou9yaF3rdkvtApsV4F+6fJkeXPIk3dY/w0ymxIDtWd7h9gEZNHfxCrp06bIlJLAFT98bD/b1mbMc8YIui4n84KgE" +
  "9OUo0afoW72vI4YAylA5fvI0uzO9BmdzTj4GYHAa+hJ9Wi3c55Onvwxq0MgWrJH/+RcnOGsHnR8D3xoSoG9Lh48XfX0yaJLAFgyd" +
  "j5GP9KdhvcbAt9RDECQoEyQ4dfqroNgEthsF/4zQSxD7YGcM/NCQAH1d3TiVznxz1nQTQ0oA9vNFg2U6esoc1k8x8ENLAvQ5jG1g" +
  "ACx6GifoNgGua0bfvCUro8Lat7Nb5RDuqNHivTR1DOfZo8g7AAZmEikUBPibBH99+wvs50ci+HYPYJFwGZDqoL7JDrp7qJN6Jxnt" +
  "riTX+z7icxzvL84blNb5O+wRSoLb+qfThvadbthYRgA18ne9tpsrdiIppq9GNt7fm+JgcHslOumeZCclZDooN7+MapylNLamhO6v" +
  "K6bZjcX04KhimiNep9cX0/hhJVRbXkqFhWU0NEv7jiSDGCCRIoQ9wnIIwOK3v9vdo9yBrbtG34dHPzJDleHO5vEozTTeA2gAPlAA" +
  "5SgpZYA7mgvoN0vz6M+rcumj53PodEs2fdueTec2Z9F50X6Qr2jfd2TRV63Z9OmGbPrfZ3Po9cfy6MXZBbRkbBENF8QBiZTEGJjm" +
  "kgyREDEcJLBA+dlhgU13PQNboEYfAg9IUyKr14erdyrCPtr7i1EK0PFZU1UptU0vpP0rcun4xmw6vyWLLm41wD0rQP9agAsCnNqU" +
  "TSdlO6G9R8NxkOAbSZKL4jsubDGI8V+rcuhncwuoeWQJpeWWMRlAOrsmecKZO0CFUf24ZroiMDKKbK8HjwBKrKxt2cYTMMKl91Vn" +
  "QyQDgKKiUnpuaiH9YWUugwbAvxMj+ctWA9wTG13gnmoxAO6qndJIckI2fA4SgQwg1AdrcuilOQXUKEgHVQGpwEBkhNceADZrW7Z3" +
  "SxV0SQAVcjz47n9ytW44Ejv2dEPUK71c5Silnz9YQJ9tkKC3G8ApwAMFuzvtlCYxzrRls3T4RrxCVTSPLBYq0SBCXBhVA2Y0od7w" +
  "wB/+FHC42BZIXv/ipUsc7EElT6gNP9WZEPXFRWUMPAC5KEWzAr1bYPpo3SUDXs9JW2Lv8lyaWlvCaqGfaMo2CbVBiMqi8rqJPDPp" +
  "WgCqwBaI6N+4+UVOS4Za9KMT0aGDxXuI+s/FiL8gRvxpOdpPBQjWSakOFGhfSl3/dZts4j3UBr5PPzcQYilVASMSZPjVw/lUXlpG" +
  "d0rbJNTSwFAFGbSx48WAVIGtS6v/yEfmTFp7CHU9Og6jvk64ZgefzKVLW10jPqARutElrqG3oSp+2GIYhADsk/U5dGyd0T4WHgIM" +
  "R/1c6Ht4DEy2AMigbA3cA69PTy7imEJfGIohVpf8XngqHwbgFXRJAMyTh58ZKqsfwCMQg8DMk5OKGHSMruMBjHgF1Nl2l23wvjDY" +
  "4ApumlZI84XfP7q6hCrKSqlA+PtZeUbLKygjp3AdR1aWsD5/dkoh/WJBPv3p6VxT3WB0q3uc2uT/GSBNQNhXH80TLmmZEVgKsVcA" +
  "zDC9rkcEUMYDypT7yJk6IXnwDMPQgwR4+aF87kTVqV0BD3Jg9AKo/xZ+/5YZBTRhmHDZcsqEGjGkCQxIRAL7pRgRvwGy4T3uC3XT" +
  "WwaQeg81DDoEj1ZMLKLXhLHHZBDPBEnBKsjPc326PptoZyb926J8lgKhVgXADNjtO/ieX4PQ5m/OHpINPGMnBASAvkdHpQsfe8+y" +
  "PAb/RBcWvS52Acqvl+TTtPpiSsw0AAfYCNqg8xHIQUvMdL3310BG2B59JXlAmiohOVqnF9CHQqroRPB8LkgrPBN+R0p2GXsI9pDH" +
  "BsoZO0y58zcH0ebL8MMc91CJfsO3d1KuEMV/XpXD+vd4F7oeHf9thxHB+4+H86ixstSM83PY1hPMNGOUq3N6yZGuJENvKR0QXBos" +
  "nyk+0/UKqdRPkgEkXTW5kA6vNYigyPilBB9BqEMrcxn8finOsLmFShW8/tZ+nwZhJwJck6leHv3x1o9+dDBGV05+Gf3PMzksxv2B" +
  "r/x8dPx7T+XS5BElDNw9Uswq0DHi+slIIewJgFhabOQCECZ+dHwRi3a0R8YV0ayGYhol7IOiojIGWyWLQIg4LSmE74FUgZWfKeyH" +
  "7bMKOB6AABS8FDz/H8VzgSS4fziDQ/FSDYyZOtdM4fslgCoxwvStu0Og+9Gh0MHJYqS8KzrtfBcjHyoBEb+z7VlCFBcyyCr4Eq+B" +
  "A9ABXKUQ2U9MKKJfLsznfAAAgmUPkCBlLm5xhXtVyBi5ABDrn+bn06IxRUwIU7JIwtol0fDsuBeI864Y8dd2ZLEEyxbEgOqIz4iM" +
  "ZBECeIfe+7NXW8DmzfKf8dDjlot/pRPRibCWL3YBPo7BwPtQiN37hHGHEWhm6DTgU4XRt1SM6DcfzzMkxRaX+wePwjPMe0KL8OEY" +
  "zvlWhn3REG2Ebz9DeAcA/q4kl3+viACDMSnLwYYnvAklcSJljgGwnLVwmVePwOYJ/pFjn4QsyIPOhAiFwecX/E0GIPuW57KdgOuU" +
  "fgaRoM9h7a+9v5DdPk+3TblupwKMEuoEASHOSwkB0b5QSAWQDVJBjfB46briuUDoSMgSdm5ljK0nCWyexh9m83CVj4WjP16OJOhi" +
  "hFH9BVlg7EHfw8KPY3vBaRp2MOrw/8Njixn4S8oy39T98LA/QigyKMkAIo6pMaTQAGnh2zX1EHGFIwJLYIpp6J7GoE3F/NW8/dLh" +
  "4+jeoYWW5frRQfC7YfQdXZfDgPkCC1IBo/nfF+fzNXCnVFEGdDKKN155JM90yY534Zv7ywcEco0Z9t1sJIK2zSxgyRPqQE9Pagbu" +
  "TSrkamLkdQzMNQIoRmD9PVScwoe0cvRDZ8LIYr3vB3yMtl0CYIwyvQgDuh5VPZ+sN/ztrqJzpz3Eup4P+ErlATyO+/oeXKeMSZyL" +
  "4pN7I1bsu8cFUFKulqZRmNt0y3DJ8tW8zJlVxh86CbpznDDivmv3LfpVcgV5fmVtK/ChOpYL1w3HlbjvKmuH9991ZJsxfpUPQLQO" +
  "DWrmrGb4fdPmIoy3ZwP4yCEgpHz3UGfEg6+MQWC7dMUaN2/ApsT/ufM/UF55E691Z6X4h95+Q1joMNK8dfApmcDB6C4WfjvcqQQN" +
  "/LU/KWQglbHmU2/L5M5FmUQ6sCKXDc4Fo4vYbasoLaVC4eLBzSsX75EjgPfwj0Iy/d9zOWaaVw9Fn5B5BiSPqh2lrIbiowB8pQaw" +
  "xmJ+xSg6L7BWqt+mRMGe/YcsjfvHSdH/EyG6z/kx/PD5OTG6kZQB4Mrgg6X/1KQiBtRf0Yey3KFeELJtm15AI5ylrKe95QPQ+skI" +
  "IecAxPHkbAeHlOH+IVV8QaoZgI8s4jCnAX5CZnSAr8cEEN95e/8fTDVg+9vfDAI8s66DFzZMsFD8o1Did8LnP++DAMelxf/S3AIG" +
  "Q7l6AG2W8BhwnT+jDaMe53whXtcJSYFoHCx1hJmV/dFpDoCX+QIgiwoNo1L4Xxbks+EHdTE8SsHXvYFnnu8wysgF9jZoAPiFI8Y+" +
  "wGvUWCEB0LnIyDVUlrJ+PeVDX+PYX4T4RTBHGX0ADyIa5MDI9kYcpQ5AHhCsrMQAfqDMCXRXRyuXznhuI28Ao7OhssSUStG6DA0w" +
  "rh07zawWYiPwk8++4IP6EupW+P1/PzefK3p8GVew6JGz76V1MkB8e1mub5tBvmLkt0wr4LiAihXYg0RetD5SbUSLzvdFbGAMrD/9" +
  "/LjLC/jt794UFmK2Jda/XYKYKcQxsmdnvEiAk9LqR/q0f6qrCBRqYKXQ+74ihep7YOEjuXNHolF9Y4VVHpfhiAprPzBvIJt2yYkk" +
  "TAAs38bl3hYQQI3+B0cVmcaUV8NPjGAYXkq/wvXDbB5M6Pi61bvawHUY+Y9PKKLbEwybwZ4e/SBZbQcA6zWbtrkIMHnGIg4AWaX/" +
  "IT7/dVG+GbTxBBEjGBM6BsqIWoIc/cj4+Rr9CCDB0t88o4D1fXxmDNxA7QBgPXnGYoMA8AmLqsfykuzB9v8DEf8nZKIHPngvbfRn" +
  "qGtavV8DibH7CagMZ0gLVm+GxacQFi6pGcv7K9mwIKHa/cKqsC/q5aHjPS14AAvxjpxAthD3AF6NfhDCl8pQ1yIYAys9PiMGbHca" +
  "sMY6hB8cPkq2197cyxssWRH9i5dxewRjLnqx/tXoRwGoiqrZtXiBt4CRyg5ulaI/ISb6eyQF+iUWctmfbedPXzYSQBbofztP1XZy" +
  "cYY3MFVB55wml/GHxEpZSSkHc75s7TzqjRm8ORzG5XKtGKA9KhUD5i/+7Bdkw954VmQA7bLcC3X3R7zofxPM9Tmc1u0vxT88hkVj" +
  "ir2Kf5YYYvT/fF6+URQSE/09zgxiFdKVq1vI1iw3bAi2B6CiaE1VJV6jf4bvny18/1yzqEK5jP8gAL7g02PIoonDS4yyqxgBbqBO" +
  "MI+a5z9Otob7ZlJfoQ8wszTo+l+AuXisj9EsdfnO2QWdwqsoqUbKVVcZIBCIhEwdkjWRXoQR2QRw8iTSxokzyeaovY/ThME2AuM1" +
  "X14VfOoVOKrgAxG8XtKYgxrIF+oA6VaO+3ucj6APZtr0iZIcfKSnhrFNri3X0cBbpgabACoA9MtFrilecPlUg4GHfLsS55ixg+wb" +
  "cvUIDH3V6n4+rr+6LYuzfBz4iRHghggAzHOdjWTDpsmD0kotK/7YtTSPM31qFq7eEObFdCskWbi8WqgC1AGg7Eqdf0y2I+J/SAKk" +
  "hXvHDMAbblhXKLVgONkQEEB9vVU3UrNvEdd3a+IzFIbqohzPAf2un49JFmYT/4Mog2MABikYVEk2q1f6UrNvB/honZiZ5v/8GPjB" +
  "VQWWE8Ce4b9195oYcEEmgNUqYAhm26aU+WxDPO8t/h+c7HGObF7Pj7UbUwFWGYEKzLiicopzVFBcmfc2JMvhAhW+fY6z8/ml5WbD" +
  "8RgJgmEElhlGIFwBK9zAIZiTP7SM0hbXUs6WJspuaaTsVq3h/44mSqip5POGZBrnJwyr5M/dzsf7jY38PUMn1tDgROP8GJBBcAOd" +
  "tRMtCQQxAQRQKbOHU872JgPINq2J/3O2NVHSqGoanCQJIER8XFm5cW67bG3yFeeL70mZM9w4P2YP3GAgqMgIBDVaFApmQAUBhk6q" +
  "YaB5FOsEaDEATX5gmGtEQwVkOylzzUghBRrdSdNqSID0ZXWGLRAjQBBCwbPI1jzfmmSQUgGJdVWUs9W3BICKYBWQIa8R4KY/Vuf9" +
  "GiEJsjY2UFyheNbUGJA3NEEkPo9XEbMsHcyAIl8vDLdOo18RYHMTZT470hz9SmqkNEu10eJDbYypjqmBoKSDW8m282fWFYQoUAFy" +
  "9mYvI1qO6vjyCnb9TEOwttK31BCfpz9aZ5wfI8CNFYT8/BfWloS5eQLbvAAq7YChk2vc7YBcJ2WtazDsgDYvTXweX1kRI0EwSsKs" +
  "LApVngAbgtv9jOjHpWGnrhHiPXXBCO+kUbbDw5rtEAO1R0GgDw4fI9v5H36g4hprysIZTDFK4ysqfI9m2eD+wWZQaoCNxy0+1Ib0" +
  "CHCOciFjwHavLLy4ZpxRFm71xBBFhMxVsAMafaqB5GnDOgV4MnxdowzI1SPZbWSPICYJujUxZMrMxa6ZQWs2brNsaphp2c/yYdlL" +
  "nQ7fn8HUvIGhE2p8X2OqgjpDFaTHSNCdqWFr9alh2HHKqsmhyhBMGF7Jo9arSFfG4H3uxiB7EM/4kAJtWnRQkIuvy4iRIKDJoYOz" +
  "addrb7kI8Mlnxy2dHq6I4FOko4nPDZGuxQSEfk9sqPJuDHpIAiYBJEGqwxqb4CYgl9fp4WqBCCwaYNUCEUqkJ98/zLdIV7bA/Zot" +
  "oNzIRbW+r9MkAdxNZBfNIFFG8IDHc0S726kWiKgbpy0QYS4R87yFS8SoqGBxuW8QVdJHHI8rKTfcQpAg1UgRw0bw6RVokgBBJ2QU" +
  "QQIzZ5Bxg8BDEjVVszQyVU2U6n8sEfPs+s2uJWJCtUiU6d8/NMJ7TMBXpE+6hQj86JlBryRoMbwDNNwHriUTIUkWksjvM0nh2dSx" +
  "VIdJoPiaCkpbKlPaQk0ljqyK2nS0WiRq7zvaIlH6MnH5FU3WpIbViMIK2uUVrjRvmx+DENHBBE0VYBSKzmcbwh8J5OfKbkhdWMvx" +
  "AngYPJoTDUIokW62JHlMfG7Pd3K+AQEqJpSyQdqNGoZoJIHPZeJCuVBkpyifP3UgXEMuFknSSCA6PWmUJEGHHxJ4EAFSJWtNA9sI" +
  "yVOHsShPqK5kMqIlVFVSYn0VH0tbUktZ6xvM68yiFPWd7ca9cX40qQO1UOQjngtFui0Vu/cALydq2VKxeoawK/AEyAACJWWmOpAk" +
  "SKirNKOBfknUplUVdUgybDeAZZdUIxt/tl2O9o5Gd+A9v08WqyBpFS3haHOp2H1elopVCwcbi0WP51ChZdXCyiOYJjyCHV1Y9gJg" +
  "xAGQHDKNQilF4h0V4li9y55oDZAILT7A1Y+1ddFaXISC9Ih078C1WPQEuuRtsehQLxdvxgWervdv2bcYnZzxVL3wBBxmyljlGOzi" +
  "fercEfwd5vcEAmBPW6vLUIUESJ4+LCqKVFH5zcvFt/tYLj7kG0ZkaJZ9R9ejjd27VfUUV1DuZhNwCXmSEWXMWFlviHgriNDqkki4" +
  "R/oTdeLZKw0bIDV6gkVHP/KzYUSot4wxU8UTa/wHeRQJxKjLXDuSM4tuYV9JJpAhaXQ1SwsFlKnLW7pJCP0aZTuI78xYUU+JjVXG" +
  "XAdd92tk5IxmRmQZf8By5kNP+N8yRt806p1Dodk0yvQKIMZ3BEACabgljZclYama757uMP39BOH2pS0cYVjzW12GnyltWn00ZRBu" +
  "cV2T9XwDey0JIyrN+IDbaJe/wZ4l1NH8EUYQKoJcRFX/986hP7lh7HfbOPiH2HAwVJtGomM52NKVJJAWOGcBF9Wyv86dLY1L1ens" +
  "48Ofz3Oyz448QcayOqPKSInyrYaUUO4eqw5xD5yTvryey9nhLuI7VNzADfhMOetJqiBEIHNfGMVFq1ziFgF1Cp7bxl3vats43UDA" +
  "ZoO9Q7FxpBSfeOXAy/bAXDsAhxE+dHyNS/zqRNAjelJXw5uA94BRCmJgTgIaxwXEZziGc/g6GTAyaw104OVx2CSp84T02iyl0ybj" +
  "NWtDA3+XmvASTvEPDF/f042NI922jp0Soq1jJVhMApSE7wiABJorBr3PujnN4TLMMjQyZGrzDlPKzPi+W1PJnlSHO5F0yZJskMle" +
  "4GQ3NmujK+KoB4sgTaA6EO8IV5ygx1vH6lEibCAZss2jFQkESGkLpE3QGkC0T7POQQTUFMQVOE2Q2ShL90KIrpoy7GT4GO/htaTO" +
  "GcEjnCWVTF55tVcQw1gjSZAaehKozaOBYbc3j9atxdkLl9Ndg7NDs318hmt2MGYMmYZbSzfctO2GCIaNAK8AGUilIjzzAPqsYx7d" +
  "KleQaPwPHz++upKfBW4mSxx/wOtNqIPcF0fxTKZQT2JBDAeYzVm0vGfbx+sXHZVxgcGhWo9XC/lCT6u4fLeifdJQVPkGgAcLPXmK" +
  "lgdwarOOyyp4dCO0mzSumlJmDOeMJNxOhKTZI5BGYkCqqd24Jv2RWmMWU1ooo34YRLCHnMLv/5Su95QAutGwacvf0e0DMriUOGRM" +
  "Vu6VEOdI0DCgmwOwDbyRQaqITnmAFg9/3+O8bsURWjXjdFODMYtZrWkQ0qhfJd0hsGrZ8pJPwy9gAvCO04I92GywqmEy9U0oCI09" +
  "oOUNhqQaojlxVBWXjLEI7uhmcMdXHkCfgRxIvqCL8DAIBNUDtROOGkVgA4yqGqYwZqrqp8cE0I0H7D6NXajjLF5SxqdKgEGX5eCS" +
  "MVYL27vI2rVZnBOQkkgBDxcW8QC2I1LC4/4BG387hfeIALoYWdey3SgfD6Uq8DQQE42CDRCBJYLK27dbTAZNMnCRyHZDjSCAhSih" +
  "ci/DlQ8AJsBmXev2gER/twgAMQI2XblyherHN7N7ERKvwKdakP5+thH/h8GmKom85gBae5AL0K9v18LDW4y6Q8xg5mBPcniBVwEf" +
  "YAJsrly5ylh1Jfq7RQDdKzh89GN2MwamlJI91OrAkwjKvRMgoJAUMQCMSA75bnYVeLCE2OxD33vaBN6MQelJpMwczmJe1TTohSph" +
  "Xe4ltZQlALDpyu3rMQF0sYJJBQgxhtQg7MpGSNFq+nKdXE6GSalw/+CLZz43kuP0bha/1N/sFbQbvjvIg4ASJp8i2ge3EeRS6kdl" +
  "HvUkVLiTPcj27Xptd7dEf48IwKXE8gYbOnbSbf0zwmMP+Ju4oXIAWgEoPAl7lpN9cs4FVFVy7B+6GyMaZEECB0BzgUe6x/UpmtSJ" +
  "oFQv+v62/umMhY6NpQS4rrFs/tKnuNIkMVJI4EkIHbA0SQwV8fNsyRLoNC/XR2CRB/v7ou/nL1lpjvzrRNYTwIwPiHbp8mVONmBe" +
  "YUIkksCflPDVomGCh+hrzO9D31+6dNlM4VOoCGAYGsYNz3zzLdU0TeUpx1FBgmif3Sv6GH1dLfocfa9jEVIC6Nbm6S+/JkfthBgJ" +
  "QgR+2YgJdOr0V922+INOAD3a9MWJUyYJEmMkCHpLVOAPH0+fHz/ptbwrLATQSQBWQh30GpwVI0GQwYfOr26cao78H69dCwZ0wSGA" +
  "zkbopdHCOOG5BTESBM3ah8F35puzQRv5QSeAro8uX75C84R7cnv/DA5UxIUzYhitc/lFn6HvkIZHX6JPg6HzLSWA5wNiJgr0Flam" +
  "DlvuIEqXcUF4F333fNsOr30bsQTQ6wjw95tX36TEnErqExfzEAIV+Ujs4PXXr7xhAt9TPz8sBPDMHWBBwpETZrAus0vRFgO7c0wf" +
  "fYM+qh8/nbCAZ09i+xFFAP0HXL16ldZs2sYVK1iqHAy3x2wD7gP0BfeLaM9t2MJp91CAHxICeOqufQfeo4r6Scx0rFh1K9sGaole" +
  "9AXKuPYdfM9SfR82AphFJZLRFy5cZAPRnu7k8mWIv/hbSC3gt3IaV/x2SIAN7Tt5bQYzqWORvg8rATyDRvj76wdHeNMCbFjRR85A" +
  "upntAyZ6ljFZE7951sJlpq4PZnAnogngKQ3UCmWYwAi3R81KvplUA36LmqWLQppRk2fzb9btpFCO+rATwHMOovrD3gVjf/IgG0Oo" +
  "clGzXKLRWGTjTpIYoAP80ZPn0Kuv7/H5+285AuiiTx8A+4UxNGvBMu68Owdl8VL2SipEMhnwbGq045mx8CZmVDXPe4z27DvkXlQT" +
  "ZuAjigB6PkEXhYgfrGvdwelP2AhY5gxr3SkyKN85fIA73J6lf3IxPyNW48JiWyij/+uHRzyqqa5FUpdHFgF8iUbMcnlzzzu0dMUa" +
  "XugQdgIkwz1CVShXEuI23mJCqCAW7qdcOKy9i2fBM+WVN/Fai1hb4YK06tXviZQRHxUEcOs4j2DI9+fO01tCnK5a104jxjxgLn+O" +
  "SRHQtRC9gwQwLrAMzwJ75eEzfwRRx3Gufi0+A9j4bhiquBdGOo7VjplGT69tp91vH6Dvvj/XKQh2LUKBjwoCuHsN1zqJT3z+8aef" +
  "c75h9catvAtGybBxnD/HpkgQxexZCJcL0UfslonEFPbN1ZfGx/tBqaV8DOfgXFyDa/Ed2FQLRCuqHkOTmhfyvXDPYx9/Rp6VmOo5" +
  "w2XV35QE8OZC+gqTYh8c2A7YEWvnT1+mJ1e3EDbHbJw4k8rrJvJ+uakFw3jtPDXi8R4bKeMYzsG5uAbXYls9eCd/ef8wnRPSx1e4" +
  "O5yu3I38/T/BLmg1Bnv5vQAAAABJRU5ErkJggg==";

/** Un raster RGBA: data[(y * width + x) * 4 + canal] */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

const descomprimir = async (b: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(
    await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer(),
  );

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** PNG RGB o RGBA de 8 bits, sin entrelazar → RGBA */
export async function decodificarPng(png: Uint8Array): Promise<Raster> {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 8 || firma.some((v, i) => png[i] !== v)) throw new Error("No es un PNG");
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let canales = 0;
  const idat: Uint8Array[] = [];
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = dv.getUint32(pos);
    const tipo = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (pos + 8 + len > png.length) throw new Error("PNG truncado");
    if (tipo === "IHDR") {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      const profundidad = png[pos + 16];
      const color = png[pos + 17];
      const entrelazado = png[pos + 20];
      if (profundidad !== 8 || (color !== 2 && color !== 6) || entrelazado !== 0) {
        throw new Error("PNG no soportado: hace falta RGB o RGBA de 8 bits sin entrelazar");
      }
      canales = color === 6 ? 4 : 3;
    } else if (tipo === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + len));
    } else if (tipo === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height || !canales) throw new Error("PNG sin IHDR");

  const comprimido = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of idat) {
    comprimido.set(c, off);
    off += c.length;
  }
  const crudo = await descomprimir(comprimido);

  const stride = width * canales;
  if (crudo.length < (stride + 1) * height) throw new Error("PNG con menos datos de los que dice");
  const data = new Uint8Array(width * height * 4);
  const fila = new Uint8Array(stride);
  const anterior = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filtro = crudo[base];
    for (let i = 0; i < stride; i++) {
      const x = crudo[base + 1 + i];
      const a = i >= canales ? fila[i - canales] : 0;
      const b = anterior[i];
      const c = i >= canales ? anterior[i - canales] : 0;
      let v: number;
      switch (filtro) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`Filtro PNG desconocido: ${filtro}`);
      }
      fila[i] = v & 0xff;
    }
    for (let px = 0; px < width; px++) {
      const o = (y * width + px) * 4;
      const s = px * canales;
      data[o] = fila[s];
      data[o + 1] = fila[s + 1];
      data[o + 2] = fila[s + 2];
      data[o + 3] = canales === 4 ? fila[s + 3] : 255;
    }
    anterior.set(fila);
  }
  return { width, height, data };
}

let cache: Promise<Raster> | null = null;

/** El logo descodificado, una vez por instancia de la función */
export function logoCamberas(): Promise<Raster> {
  if (!cache) {
    const bin = atob(LOGO_PNG_BASE64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    cache = decodificarPng(bytes).catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}
