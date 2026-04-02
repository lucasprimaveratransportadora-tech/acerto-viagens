const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

async function getGlobal(empresaId) {
  const baseWhere = {
    deleted_at: null,
    truck: { empresa_id: empresaId, deleted_at: null },
  };

  const [tripAgg, cteAgg, expenseAgg, fuelAgg, byMonth] = await Promise.all([
    // Total viagens and km
    prisma.trip.aggregate({
      where: baseWhere,
      _count: { id: true },
      _sum: { km_total: true },
    }),

    // Total frete (sum of CTE values)
    prisma.cte.aggregate({
      where: { trip: baseWhere },
      _sum: { valor: true },
    }),

    // Total despesas (sum of expense values)
    prisma.expense.aggregate({
      where: { trip: baseWhere },
      _sum: { valor: true },
    }),

    // Total litros
    prisma.fuel.aggregate({
      where: { trip: baseWhere },
      _sum: { litros: true },
    }),

    // By month grouping via raw query
    prisma.$queryRaw`
      SELECT
        TO_CHAR(t.data_inicio, 'YYYY-MM') AS mes,
        COUNT(DISTINCT t.id)::int AS viagens,
        COALESCE(SUM(c.valor_cte), 0) AS frete,
        COALESCE(SUM(e.valor_despesa), 0) AS despesas,
        COALESCE(SUM(t.km_total), 0)::int AS km,
        COALESCE(SUM(f.litros_fuel), 0) AS litros
      FROM trips t
      INNER JOIN trucks tr ON tr.id = t.truck_id AND tr.empresa_id = ${empresaId} AND tr.deleted_at IS NULL
      LEFT JOIN (
        SELECT trip_id, SUM(valor) AS valor_cte FROM ctes GROUP BY trip_id
      ) c ON c.trip_id = t.id
      LEFT JOIN (
        SELECT trip_id, SUM(valor) AS valor_despesa FROM expenses GROUP BY trip_id
      ) e ON e.trip_id = t.id
      LEFT JOIN (
        SELECT trip_id, SUM(litros) AS litros_fuel FROM fuels GROUP BY trip_id
      ) f ON f.trip_id = t.id
      WHERE t.deleted_at IS NULL
      GROUP BY mes
      ORDER BY mes DESC
    `,
  ]);

  const totalFrete = Number(cteAgg._sum.valor || 0);
  const totalDespesas = Number(expenseAgg._sum.valor || 0);

  return {
    totalViagens: tripAgg._count.id,
    totalFrete,
    totalDespesas,
    resultado: totalFrete - totalDespesas,
    totalKm: tripAgg._sum.km_total || 0,
    totalLitros: Number(fuelAgg._sum.litros || 0),
    byMonth: byMonth.map((row) => ({
      mes: row.mes,
      viagens: Number(row.viagens),
      frete: Number(row.frete),
      despesas: Number(row.despesas),
      resultado: Number(row.frete) - Number(row.despesas),
      km: Number(row.km),
      litros: Number(row.litros),
    })),
  };
}

async function getByTruck(truckId, empresaId) {
  // Verify truck belongs to empresa
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const baseWhere = {
    deleted_at: null,
    truck_id: truckId,
  };

  const [tripAgg, cteAgg, expenseAgg, fuelAgg, byMonth] = await Promise.all([
    prisma.trip.aggregate({
      where: baseWhere,
      _count: { id: true },
      _sum: { km_total: true },
    }),

    prisma.cte.aggregate({
      where: { trip: baseWhere },
      _sum: { valor: true },
    }),

    prisma.expense.aggregate({
      where: { trip: baseWhere },
      _sum: { valor: true },
    }),

    prisma.fuel.aggregate({
      where: { trip: baseWhere },
      _sum: { litros: true },
    }),

    prisma.$queryRaw`
      SELECT
        TO_CHAR(t.data_inicio, 'YYYY-MM') AS mes,
        COUNT(DISTINCT t.id)::int AS viagens,
        COALESCE(SUM(c.valor_cte), 0) AS frete,
        COALESCE(SUM(e.valor_despesa), 0) AS despesas,
        COALESCE(SUM(t.km_total), 0)::int AS km,
        COALESCE(SUM(f.litros_fuel), 0) AS litros
      FROM trips t
      LEFT JOIN (
        SELECT trip_id, SUM(valor) AS valor_cte FROM ctes GROUP BY trip_id
      ) c ON c.trip_id = t.id
      LEFT JOIN (
        SELECT trip_id, SUM(valor) AS valor_despesa FROM expenses GROUP BY trip_id
      ) e ON e.trip_id = t.id
      LEFT JOIN (
        SELECT trip_id, SUM(litros) AS litros_fuel FROM fuels GROUP BY trip_id
      ) f ON f.trip_id = t.id
      WHERE t.deleted_at IS NULL
        AND t.truck_id = ${truckId}
      GROUP BY mes
      ORDER BY mes DESC
    `,
  ]);

  const totalFrete = Number(cteAgg._sum.valor || 0);
  const totalDespesas = Number(expenseAgg._sum.valor || 0);

  return {
    truckId,
    placa: truck.placa,
    totalViagens: tripAgg._count.id,
    totalFrete,
    totalDespesas,
    resultado: totalFrete - totalDespesas,
    totalKm: tripAgg._sum.km_total || 0,
    totalLitros: Number(fuelAgg._sum.litros || 0),
    byMonth: byMonth.map((row) => ({
      mes: row.mes,
      viagens: Number(row.viagens),
      frete: Number(row.frete),
      despesas: Number(row.despesas),
      resultado: Number(row.frete) - Number(row.despesas),
      km: Number(row.km),
      litros: Number(row.litros),
    })),
  };
}

module.exports = { getGlobal, getByTruck };
