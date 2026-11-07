import { describe, expect, it } from "vitest";
import { amountInWordsCOP, numberToSpanishWords as w } from "./number-words";

describe("numberToSpanishWords", () => {
  it.each([
    [0, "cero"],
    [1, "un"],
    [15, "quince"],
    [16, "dieciséis"],
    [21, "veintiún"],
    [22, "veintidós"],
    [30, "treinta"],
    [31, "treinta y un"],
    [99, "noventa y nueve"],
    [100, "cien"],
    [101, "ciento un"],
    [115, "ciento quince"],
    [500, "quinientos"],
    [777, "setecientos setenta y siete"],
    [1000, "mil"],
    [1001, "mil un"],
    [2000, "dos mil"],
    [21000, "veintiún mil"],
    [100000, "cien mil"],
    [101000, "ciento un mil"],
    [450000, "cuatrocientos cincuenta mil"],
    [999999, "novecientos noventa y nueve mil novecientos noventa y nueve"],
    [1000000, "un millón"],
    [1500000, "un millón quinientos mil"],
    [2400000, "dos millones cuatrocientos mil"],
    [21000000, "veintiún millones"],
    [1000000000, "mil millones"],
    [1250000000, "mil doscientos cincuenta millones"],
  ])("%i → %s", (n, expected) => {
    expect(w(n)).toBe(expected);
  });
});

describe("amountInWordsCOP", () => {
  it("adds pesos M/CTE in uppercase", () => {
    expect(amountInWordsCOP(900000)).toBe("NOVECIENTOS MIL PESOS M/CTE");
    expect(amountInWordsCOP(2400000)).toBe("DOS MILLONES CUATROCIENTOS MIL PESOS M/CTE");
    expect(amountInWordsCOP(1800000)).toBe("UN MILLÓN OCHOCIENTOS MIL PESOS M/CTE");
  });
  it("uses 'de pesos' after exact millions", () => {
    expect(amountInWordsCOP(1000000)).toBe("UN MILLÓN DE PESOS M/CTE");
    expect(amountInWordsCOP(3000000)).toBe("TRES MILLONES DE PESOS M/CTE");
  });
  it("handles one peso and zero", () => {
    expect(amountInWordsCOP(1)).toBe("UN PESO M/CTE");
    expect(amountInWordsCOP(0)).toBe("CERO PESOS M/CTE");
  });
});
