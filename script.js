// --- DOM elements ---
const randomBtn = document.getElementById("random-btn");
const recipeDisplay = document.getElementById("recipe-display");
const remixBtn = document.getElementById("remix-btn");
const remixTheme = document.getElementById("remix-theme");
const remixOutput = document.getElementById("remix-output");
const saveBtn = document.getElementById("save-btn");
const savedContainer = document.getElementById("saved-recipes-container");
const savedList = document.getElementById("saved-recipes-list");

// Store the currently-displayed recipe JSON so we can send it to OpenAI
let currentRecipe = null;
// Loading animation timer id for the friendly remix message
let loadingTimer = null;

function startLoadingMessage() {
  if (!remixOutput) return;
  let dots = 0;
  remixOutput.textContent = "Chef is whipping up a tasty remix";
  loadingTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    remixOutput.textContent = `Chef is whipping up a tasty remix${'.'.repeat(dots)}`;
  }, 480);
}

function stopLoadingMessage() {
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

/* --- Saved recipes (localStorage) --- */
function getSavedRecipes() {
  try {
    return JSON.parse(localStorage.getItem('savedRecipes') || '[]');
  } catch (e) {
    return [];
  }
}

function setSavedRecipes(list) {
  localStorage.setItem('savedRecipes', JSON.stringify(list));
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderSavedRecipes() {
  if (!savedContainer || !savedList) return;
  const list = getSavedRecipes();
  savedContainer.style.display = list.length ? '' : 'none';
  savedList.innerHTML = list.map((name, idx) =>
    `<li class="saved-recipe-item"><span data-idx="${idx}" tabindex="0">${escapeHtml(name)}</span><button class="delete-btn" data-idx="${idx}">Delete</button></li>`
  ).join('') || '';
}

function saveCurrentRecipe() {
  if (!currentRecipe) {
    // Friendly inline message
    remixOutput.textContent = 'No recipe to save yet. Click "Surprise Me Again!" first.';
    return;
  }
  const name = currentRecipe.strMeal;
  const list = getSavedRecipes();
  if (list.includes(name)) {
    remixOutput.textContent = 'That recipe is already saved.';
    return;
  }
  list.push(name);
  setSavedRecipes(list);
  renderSavedRecipes();
  remixOutput.textContent = 'Saved! You can find this recipe in the list above.';
}

// Delegate clicks inside saved list (delete or name click)
if (savedList) {
  savedList.addEventListener('click', (e) => {
    const del = e.target.closest('.delete-btn');
    if (del) {
      const idx = Number(del.dataset.idx);
      const list = getSavedRecipes();
      if (!Number.isNaN(idx)) {
        list.splice(idx, 1);
        setSavedRecipes(list);
        renderSavedRecipes();
      }
      return;
    }
    const span = e.target.closest('span[data-idx]');
    if (span) {
      // When a saved name is clicked, fetch full recipe by name and render it
      const idx = Number(span.dataset.idx);
      const list = getSavedRecipes();
      if (!Number.isNaN(idx) && list[idx]) {
        fetchAndDisplayRecipeByName(list[idx]);
      }
    }
  });
}

if (saveBtn) saveBtn.addEventListener('click', saveCurrentRecipe);

// Render saved recipes on load
document.addEventListener('DOMContentLoaded', renderSavedRecipes);

// This function creates a list of ingredients for the recipe from the API data
// It loops through the ingredients and measures, up to 20, and returns an HTML string
// that can be used to display them in a list format
// If an ingredient is empty or just whitespace, it skips that item 
function getIngredientsHtml(recipe) {
  let html = "";
  for (let i = 1; i <= 20; i++) {
    const ing = recipe[`strIngredient${i}`];
    const meas = recipe[`strMeasure${i}`];
    if (ing && ing.trim()) html += `<li>${meas ? `${meas} ` : ""}${ing}</li>`;
  }
  return html;
}

// This function displays the recipe on the page
function renderRecipe(recipe) {
  recipeDisplay.innerHTML = `
    <div class="recipe-title-row">
      <h2>${recipe.strMeal}</h2>
    </div>
    <img src="${recipe.strMealThumb}" alt="${recipe.strMeal}" />
    <h3>Ingredients:</h3>
    <ul>${getIngredientsHtml(recipe)}</ul>
    <h3>Instructions:</h3>
    <p>${recipe.strInstructions.replace(/\r?\n/g, "<br>")}</p>
  `;
}

// This function gets a random recipe from the API and shows it
async function fetchAndDisplayRandomRecipe() {
  recipeDisplay.innerHTML = "<p>Loading...</p>"; // Show loading message
  try {
    // Fetch a random recipe from the MealDB API
    const res = await fetch('https://www.themealdb.com/api/json/v1/1/random.php'); // Replace with the actual API URL
    const data = await res.json(); // Parse the JSON response
  const recipe = data.meals[0]; // Get the first recipe from the response

  // Save and render the recipe
  currentRecipe = recipe;
  renderRecipe(recipe); // Display the recipe

  } catch (error) {
    recipeDisplay.innerHTML = "<p>Sorry, couldn't load a recipe.</p>";
  }
}

// Fetch and display a recipe by its exact name (MealDB search by name)
async function fetchAndDisplayRecipeByName(name) {
  if (!name) return;
  recipeDisplay.innerHTML = "<p>Loading recipe...</p>";
  try {
    const q = encodeURIComponent(name);
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${q}`);
    const data = await res.json();
    if (!data || !data.meals || !data.meals.length) {
      recipeDisplay.innerHTML = `<p>Couldn't find details for "${escapeHtml(name)}".</p>`;
      return;
    }
    const recipe = data.meals[0];
    currentRecipe = recipe;
    renderRecipe(recipe);
  } catch (err) {
    console.error(err);
    recipeDisplay.innerHTML = `<p>Sorry — couldn't load that recipe right now.</p>`;
  }
}


// --- Event listeners ---

// When the button is clicked, get and show a new random recipe
randomBtn.addEventListener("click", fetchAndDisplayRandomRecipe);

// When the page loads, show a random recipe right away
document.addEventListener("DOMContentLoaded", fetchAndDisplayRandomRecipe);

// Remix: send the raw recipe JSON and selected theme to OpenAI and show a short remix
async function remixCurrentRecipe() {
  if (!currentRecipe) {
    remixOutput.textContent = 'No recipe loaded yet. Click "Surprise Me Again!" to fetch one.';
    return;
  }

  const theme = remixTheme ? remixTheme.value : '';
  startLoadingMessage();
  if (remixBtn) remixBtn.disabled = true;

  try {
    const systemMsg = `You are a playful, concise chef assistant. Produce a short, fun, creative, and totally doable remix of the provided recipe. Be explicit about any changed ingredients or changed cooking steps.`;

    const userMsg = `Original recipe JSON:\n${JSON.stringify(currentRecipe)}\n\nRemix theme: ${theme}\n\nRespond with a short title, a clear ingredients list (note substitutions), and step-by-step instructions. Boldly call out changed items with a short note. Keep it practical and under ~300 words.`;

    const payload = {
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg }
      ],
      max_tokens: 450,
      temperature: 0.8
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const ai = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : 'Sorry — no response from the AI.';

  // Stop the loading message and render AI text, preserving line breaks
  stopLoadingMessage();
  remixOutput.innerHTML = ai.replace(/\n/g, '<br>');

  } catch (err) {
    console.error(err);
    stopLoadingMessage();
    // Friendly, simple message for users when something goes wrong
    remixOutput.textContent = "Oops — we couldn't make a remix right now. Please try again in a moment.";
  } finally {
    if (remixBtn) remixBtn.disabled = false;
  }
}

if (remixBtn) remixBtn.addEventListener('click', remixCurrentRecipe);