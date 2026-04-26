/**
 * Spanish copy for the UI. Centralized so translation work later does not
 * require touching component files.
 */
export const es = {
  app: {
    title: "FinanceOS",
  },
  nav: {
    dashboard: "Dashboard",
    movements: "Movimientos",
    review: "Revision",
    settings: "Configuración",
  },
  views: {
    dashboardEyebrow: "Vista general",
    movementsEyebrow: "Explorador",
    reviewEyebrow: "Cola de revisión",
    settingsEyebrow: "Configuración",
    settingsTitle: "Configuración",
    settingsAdministration: "Administración",
  },
  dashboard: {
    monthSelectorTitle: "Selector de mes",
    monthSelectorSubtitle:
      "El dashboard recalcula categorías, subcategorías y presupuesto según el periodo.",
    breakdownTitle: "Desglose por subcategoria",
    breakdownSubtitleAll:
      "Participación de las subcategorías con más gasto.",
    breakdownSubtitleFiltered: (categoryName: string) =>
      `Participación dentro de ${categoryName}.`,
    consideredTitle: "Movimientos considerados",
    consideredSubtitleAll: "Todos los movimientos considerados",
    consideredSubtitleCategory: (categoryName: string) =>
      `Categoria: ${categoryName}`,
    consideredSubtitleSubcategory: (subcategoryName: string) =>
      `Subcategoria: ${subcategoryName}`,
    clearFilter: "Limpiar filtro",
    metrics: {
      totalSpent: "Total gastado",
      totalSaved: "Total ahorrado",
      totalIncome: "Total ingresos",
      balance: "Balance",
    },
    columns: {
      date: "Fecha",
      movement: "Movimiento",
      category: "Categoría",
      subcategory: "Subcategoría",
      amount: "Monto",
    },
    spentLabel: (amount: string) => `${amount} gastado`,
  },
  movements: {
    filtersTitle: "Filtros",
    filtersSubtitle: "Búsqueda, fuente y estado de revisión.",
    searchPlaceholder: "Buscar comercio o descripción",
    sourceLabel: "Fuente",
    sources: {
      all: "Todas",
      bank: "Cuenta",
      creditCard: "Tarjeta",
      manual: "Manual",
    },
    reviewLabel: "Revisión",
    reviewFilters: {
      all: "Todos",
      pending: "No revisados",
      reviewed: "Revisados",
    },
    columns: {
      accountingDate: "Accounting date",
      movement: "Movimiento",
      source: "Fuente",
      amount: "Monto",
      classification: "Clasificación",
      reviewed: "Revisado",
    },
  },
  review: {
    nothingTitle: "No hay movimientos para revisar.",
    nothingHint: "Prueba con otro filtro o vuelve al dashboard.",
    rawDateLabel: "Raw date",
    accountingDateLabel: "Accounting date",
    datesEyebrow: "Fechas",
    originalDescription: "Descripcion original",
    confirmAndContinue: "Confirmar y seguir",
  },
  settings: {
    deleteCategoryTooltip: "Eliminar categoría",
    deleteSubcategoryTooltip: "Eliminar subcategoría",
    saveNameTooltip: "Guardar nombre",
    saveBudgetTooltip: "Guardar budget",
    renameCategoryLabel: "Renombrar categoría",
    renameSubcategoryLabel: "Renombrar subcategoría",
    budgetLabel: "Budget",
    moveSubcategoriesLabel: "Mover subcategorías a",
    moveButton: "Mover",
    sendAllLabel: "Enviar todas a",
    sendAllButton: "Enviar todas",
    movementCount: (count: number) => `${count} movimientos`,
    subcategoryCount: (count: number) => `${count} subcategorías`,
    categoryUpdated: "Categoría actualizada.",
    budgetUpdated: "Budget actualizado.",
    subcategoriesMoved: "Subcategorías movidas.",
    categoryDeleted: "Categoría eliminada.",
    subcategoryUpdated: "Subcategoría actualizada.",
    subcategoryDeleted: "Subcategoría eliminada.",
    movementsReassigned: "Movimientos reasignados.",
    kindLabels: {
      INCOME: "Ingreso",
      EXPENSE: "Gasto",
      UNCHARGEABLE: "No imputable",
    } as const,
    sourceLabels: {
      BANK: "Cuenta corriente",
      CREDIT_CARD: "Tarjeta",
      MANUAL: "Manual",
    } as const,
  },
  errors: {
    generic: "Ocurrió un error. Inténtalo de nuevo.",
    network: "No se pudo contactar al backend.",
  },
} as const;
