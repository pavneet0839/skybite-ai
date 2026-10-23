export const supportedAllergens = [
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'tree-nuts', label: 'Tree nuts' },
  { id: 'milk', label: 'Milk' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
]

// These are illustrative prototype meals, not verified airline recipes.
// Confirm all ingredients and allergen information before real-world use.
export const meals = [
  {
    id: 'standard',
    name: 'Classic Vegetable Rice Bowl',
    category: 'standard',
    description: 'A simple vegetable rice bowl.',
    ingredients: [
      'Rice',
      'Carrots',
      'Green peas',
      'Bell peppers',
      'Sunflower oil',
      'Salt',
    ],
    allergens: [],
  },
  {
    id: 'sattvik',
    name: 'Sattvik Vegetable Khichdi',
    category: 'sattvik',
    description: 'A simple rice and lentil dish without onion or garlic.',
    ingredients: [
      'Rice',
      'Moong dal',
      'Carrots',
      'Cumin',
      'Turmeric',
      'Ghee',
      'Salt',
    ],
    allergens: ['milk'],
  },
  {
    id: 'jain',
    name: 'Jain Vegetable Rice',
    category: 'jain',
    description: 'An illustrative Jain-style rice dish.',
    ingredients: [
      'Rice',
      'Green peas',
      'Bell peppers',
      'Cumin',
      'Sunflower oil',
      'Salt',
    ],
    allergens: [],
  },
  {
    id: 'vegan',
    name: 'Vegan Chickpea Bowl',
    category: 'vegan',
    description: 'Chickpeas, vegetables, and seasoned rice.',
    ingredients: [
      'Rice',
      'Chickpeas',
      'Tomatoes',
      'Carrots',
      'Sunflower oil',
      'Cumin',
      'Salt',
    ],
    allergens: [],
  },
  {
    id: 'iftar',
    name: 'Iftar Date and Rice Meal',
    category: 'iftar',
    description: 'A simple meal concept suitable for an Iftar menu.',
    ingredients: [
      'Rice',
      'Dates',
      'Chickpeas',
      'Carrots',
      'Sunflower oil',
      'Salt',
    ],
    allergens: [],
  },
]

export const supportedDietaryRequirements = [
  {
    id: 'navratri-sattvik',
    label: 'Navratri / Sattvik',
    category: 'sattvik',
    reason: 'The catalogue describes this Sattvik meal as without onion or garlic.',
    verificationWarning:
      'Possible catalogue match only. Navratri requirements and the complete recipe are not verified.',
  },
  {
    id: 'strict-jain',
    label: 'Strict Jain',
    category: 'jain',
    reason: 'The catalogue labels this meal Jain-style.',
    verificationWarning:
      'Possible catalogue match only. Strict Jain ingredients and preparation requirements are not verified.',
  },
  {
    id: 'ramzan-iftar',
    label: 'Ramzan / Iftar',
    category: 'iftar',
    reason: 'The catalogue describes this as a meal concept suitable for an Iftar menu.',
    verificationWarning:
      'Possible catalogue match only. Individual requirements, timing, and the complete recipe are not verified.',
  },
]

export function getMealRecommendations(declaredRequirements = []) {
  return supportedDietaryRequirements.flatMap((requirement) => {
    if (!declaredRequirements.includes(requirement.id)) return []

    return meals
      .filter((meal) => meal.category === requirement.category)
      .map((meal) => ({
        meal,
        requirement: requirement.label,
        reason: requirement.reason,
        verificationWarning: requirement.verificationWarning,
      }))
  })
}

const normalize = (value) =>
  value.trim().toLowerCase().replace(/[-_]/g, ' ')

export const allergenAliases = {
  peanuts: ['peanut', 'peanuts'],
  'tree nuts': [
    'tree nut',
    'tree nuts',
    'almond',
    'cashew',
    'walnut',
    'pistachio',
    'hazelnut',
  ],
  milk: ['milk', 'dairy', 'ghee', 'butter', 'cheese', 'cream'],
  eggs: ['egg', 'eggs'],
  wheat: ['wheat', 'gluten'],
  soy: ['soy', 'soya', 'soybean'],
  sesame: ['sesame', 'tahini'],
}

export function getAllergyAssessment(meal, declaredAllergies = []) {
  const knownAllergyIds = supportedAllergens.map(
    (allergen) => allergen.id,
  )

  const knownAllergies = declaredAllergies.filter((allergy) =>
    knownAllergyIds.includes(allergy),
  )

  const customAllergies = declaredAllergies.filter(
    (allergy) => !knownAllergyIds.includes(allergy),
  )

  const matchedKnownAllergens = knownAllergies.filter((allergy) =>
    meal.allergens.includes(allergy),
  )

  const normalizedIngredients = meal.ingredients.map(normalize)

  const matchedCustomAllergies = customAllergies.filter((allergy) => {
    const searchTerm = normalize(allergy)

    return normalizedIngredients.some((ingredient) =>
      ingredient.includes(searchTerm),
    )
  })

  const hasKnownConflict = matchedKnownAllergens.length > 0
  const hasCustomConflict = matchedCustomAllergies.length > 0
  const needsCustomReview = customAllergies.length > 0

  let status = 'clear'

  if (hasKnownConflict || hasCustomConflict) {
    status = 'blocked'
  } else if (needsCustomReview) {
    status = 'review'
  }

  return {
    status,
    matchedKnownAllergens,
    matchedCustomAllergies,
    needsCustomReview,
  }
}
