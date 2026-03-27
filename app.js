'use strict';

const GOALS = { kcal: 2700, p: 178, f: 75, c: 328 };
const TIMINGS = ['朝食', '昼食', '夕食', '間食'];

// ── Storage helpers ──────────────────────────────────────────────
const store = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Default food master ───────────────────────────────────────────
const DEFAULT_FOODS = [
  { id: 'f1', name: '鶏むね肉（皮なし）', kcal: 108, p: 22.3, f: 1.5, c: 0 },
  { id: 'f2', name: '鶏もも肉（皮なし）', kcal: 127, p: 19.0, f: 5.0, c: 0 },
  { id: 'f3', name: '豚ロース', kcal: 263, p: 19.3, f: 19.2, c: 0.2 },
  { id: 'f4', name: '牛もも肉', kcal: 193, p: 21.2, f: 10.7, c: 0.5 },
  { id: 'f5', name: '卵', kcal: 151, p: 12.3, f: 10.3, c: 0.3 },
  { id: 'f6', name: '白米（炊飯後）', kcal: 168, p: 2.5, f: 0.3, c: 37.1 },
  { id: 'f7', name: 'オートミール', kcal: 380, p: 13.7, f: 5.7, c: 69.1 },
  { id: 'f8', name: '食パン', kcal: 264, p: 9.3, f: 4.4, c: 46.7 },
  { id: 'f9', name: '牛乳', kcal: 67, p: 3.3, f: 3.8, c: 4.8 },
  { id: 'f10', name: 'ギリシャヨーグルト', kcal: 59, p: 10.0, f: 0.4, c: 3.6 },
  { id: 'f11', name: 'プロテインパウダー', kcal: 385, p: 75.0, f: 3.0, c: 10.0 },
  { id: 'f12', name: 'バナナ', kcal: 86, p: 1.1, f: 0.2, c: 22.5 },
  { id: 'f13', name: 'さつまいも', kcal: 132, p: 1.2, f: 0.2, c: 30.3 },
  { id: 'f14', name: 'ブロッコリー', kcal: 33, p: 3.7, f: 0.4, c: 5.2 },
  { id: 'f15', name: 'サーモン', kcal: 208, p: 20.1, f: 13.4, c: 0.1 },
  { id: 'f16', name: 'ツナ缶（水煮）', kcal: 71, p: 16.0, f: 0.7, c: 0.1 },
  { id: 'f17', name: 'アーモンド', kcal: 608, p: 19.6, f: 51.8, c: 18.5 },
  { id: 'f18', name: 'オリーブオイル', kcal: 921, p: 0, f: 100.0, c: 0 },
];

// ── App State ────────────────────────────────────────────────────
const App = (() => {
  let foods = [];
  let recipes = [];
  let recipeIngredients = []; // temp while building recipe
  let modalFood = null;        // food selected in add-modal
  let modalRecipe = null;      // recipe selected in recipe-modal
  let trendPeriod = 7;
  let kcalChart = null;
  let pfcChart = null;
  let chatHistory = [];        // { role, content, streaming?, error? }
  let chatStreaming = false;

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    // Load or seed food master
    const saved = store.get('foods', null);
    if (!saved) {
      foods = DEFAULT_FOODS.map(f => ({ ...f }));
      store.set('foods', foods);
    } else {
      foods = saved;
    }
    recipes = store.get('recipes', []);

    populateFoodSelects();
    renderTodaySummary();
    renderTodayMeals();
    renderFoodMasterList();
    renderSavedRecipes();
    initChat();

    // Register SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ── Tab switching ─────────────────────────────────────────────
  function switchTab(name, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + name).classList.add('active');
    btn.classList.add('active');

    if (name === 'trend') renderTrendCharts();
    if (name === 'register') renderFoodMasterList();
    if (name === 'recipe') { populateFoodSelects(); renderSavedRecipes(); }
    if (name === 'single') populateFoodSelects();
  }

  function switchSubTab(tab, sub, btn) {
    if (tab === 'search') {
      document.getElementById('search-food-panel').style.display = sub === 'food' ? '' : 'none';
      document.getElementById('search-recipe-panel').style.display = sub === 'recipe' ? '' : 'none';
    }
    btn.closest('.sub-tabs').querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // ── Food selects ──────────────────────────────────────────────
  function populateFoodSelects() {
    const selects = ['single-food-select', 'recipe-food-select'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const current = el.value;
      el.innerHTML = '<option value="">食品を選択してください</option>';
      foods.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        el.appendChild(opt);
      });
      el.value = current;
    });

    // Single tab: attach change listener once
    const si = document.getElementById('single-food-select');
    si.onchange = () => {
      const f = foods.find(x => x.id === si.value);
      const info = document.getElementById('single-food-info');
      if (f) {
        document.getElementById('si-kcal').textContent = f.kcal;
        document.getElementById('si-p').textContent = f.p + 'g';
        document.getElementById('si-f').textContent = f.f + 'g';
        document.getElementById('si-c').textContent = f.c + 'g';
        info.style.display = '';
      } else {
        info.style.display = 'none';
      }
      updateSingleCalc();
    };
  }

  // ── Today summary ─────────────────────────────────────────────
  function getTodayMeals() {
    return store.get('meals_' + todayKey(), []);
  }

  function renderTodaySummary() {
    const meals = getTodayMeals();
    let kcal = 0, p = 0, f = 0, c = 0;
    meals.forEach(m => { kcal += m.kcal; p += m.p; f += m.f; c += m.c; });

    document.getElementById('today-kcal').textContent = Math.round(kcal);
    document.getElementById('today-p').textContent = p.toFixed(1) + 'g';
    document.getElementById('today-f').textContent = f.toFixed(1) + 'g';
    document.getElementById('today-c').textContent = c.toFixed(1) + 'g';

    setBar('kcal-bar', kcal, GOALS.kcal);
    setBar('p-bar', p, GOALS.p);
    setBar('f-bar', f, GOALS.f);
    setBar('c-bar', c, GOALS.c);
  }

  function setBar(id, val, goal) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(100, (val / goal) * 100) + '%';
  }

  function renderTodayMeals() {
    const meals = getTodayMeals();
    const container = document.getElementById('today-meal-list');
    if (!meals.length) {
      container.innerHTML = '<div class="empty-state">まだ食事が記録されていません</div>';
      return;
    }

    const groups = {};
    TIMINGS.forEach(t => groups[t] = []);
    meals.forEach(m => {
      if (!groups[m.timing]) groups[m.timing] = [];
      groups[m.timing].push(m);
    });

    let html = '';
    TIMINGS.forEach(timing => {
      const list = groups[timing];
      if (!list.length) return;
      html += `<div class="meal-group">
        <div class="meal-group-title">${timing}</div>`;
      list.forEach(m => {
        html += `<div class="meal-item">
          <div>
            <div class="meal-item-name">${escHtml(m.name)}</div>
            <div class="meal-item-sub">${m.gram ? m.gram + 'g' : ''} P${m.p.toFixed(1)} F${m.f.toFixed(1)} C${m.c.toFixed(1)}</div>
          </div>
          <div class="meal-item-right">
            <div class="meal-item-kcal">${Math.round(m.kcal)} kcal</div>
            <button class="delete-btn" onclick="App.deleteMeal('${m.id}')">×</button>
          </div>
        </div>`;
      });
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function deleteMeal(id) {
    const meals = getTodayMeals().filter(m => m.id !== id);
    store.set('meals_' + todayKey(), meals);
    renderTodaySummary();
    renderTodayMeals();
    toast('削除しました');
  }

  // ── Single record ─────────────────────────────────────────────
  function updateSingleCalc() {
    const fid = document.getElementById('single-food-select').value;
    const gram = parseFloat(document.getElementById('single-gram').value);
    const food = foods.find(x => x.id === fid);
    const calc = document.getElementById('single-calc-display');

    if (!food || !gram || gram <= 0) { calc.style.display = 'none'; return; }
    calc.style.display = '';
    const ratio = gram / 100;
    document.getElementById('single-calc-kcal').textContent = (food.kcal * ratio).toFixed(1) + ' kcal';
    document.getElementById('single-calc-p').textContent = (food.p * ratio).toFixed(1) + 'g';
    document.getElementById('single-calc-f').textContent = (food.f * ratio).toFixed(1) + 'g';
    document.getElementById('single-calc-c').textContent = (food.c * ratio).toFixed(1) + 'g';
  }

  function selectTiming(el) {
    el.closest('.timing-chips').querySelectorAll('.timing-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }

  function recordSingle() {
    const fid = document.getElementById('single-food-select').value;
    const gram = parseFloat(document.getElementById('single-gram').value);
    const food = foods.find(x => x.id === fid);
    if (!food) { toast('食品を選択してください'); return; }
    if (!gram || gram <= 0) { toast('グラム数を入力してください'); return; }

    const timing = document.querySelector('#single-timing-chips .timing-chip.active')?.dataset.val || '朝食';
    const ratio = gram / 100;
    addMealEntry({
      name: food.name,
      gram,
      timing,
      kcal: food.kcal * ratio,
      p: food.p * ratio,
      f: food.f * ratio,
      c: food.c * ratio,
    });

    document.getElementById('single-food-select').value = '';
    document.getElementById('single-gram').value = '';
    document.getElementById('single-food-info').style.display = 'none';
    document.getElementById('single-calc-display').style.display = 'none';
    toast('記録しました！');
  }

  function addMealEntry(entry) {
    const meals = getTodayMeals();
    meals.push({ ...entry, id: uid(), date: todayKey() });
    store.set('meals_' + todayKey(), meals);
    // Save daily summary for trend
    saveDailySummary();
    renderTodaySummary();
    renderTodayMeals();
  }

  // ── Recipe tab ────────────────────────────────────────────────
  function addRecipeIngredient() {
    const fid = document.getElementById('recipe-food-select').value;
    const gram = parseFloat(document.getElementById('recipe-food-gram').value);
    const food = foods.find(x => x.id === fid);
    if (!food) { toast('食品を選択してください'); return; }
    if (!gram || gram <= 0) { toast('グラム数を入力してください'); return; }

    recipeIngredients.push({ foodId: fid, name: food.name, gram,
      kcal: food.kcal * gram / 100,
      p: food.p * gram / 100,
      f: food.f * gram / 100,
      c: food.c * gram / 100,
    });
    document.getElementById('recipe-food-select').value = '';
    document.getElementById('recipe-food-gram').value = '';
    renderRecipeIngredients();
  }

  function removeRecipeIngredient(idx) {
    recipeIngredients.splice(idx, 1);
    renderRecipeIngredients();
  }

  function renderRecipeIngredients() {
    const list = document.getElementById('recipe-ingredient-list');
    if (!recipeIngredients.length) { list.innerHTML = ''; updateRecipeTotal(); return; }
    list.innerHTML = recipeIngredients.map((ing, i) =>
      `<div class="ingredient-item">
        <div>
          <div style="font-size:13px;font-weight:600">${escHtml(ing.name)}</div>
          <div style="font-size:11px;color:var(--text2)">${ing.gram}g · ${ing.kcal.toFixed(0)}kcal</div>
        </div>
        <button class="delete-btn" onclick="App.removeRecipeIngredient(${i})">×</button>
      </div>`
    ).join('');
    updateRecipeTotal();
  }

  function updateRecipeTotal() {
    const tot = recipeIngredients.reduce((a, b) => ({
      kcal: a.kcal + b.kcal, p: a.p + b.p, f: a.f + b.f, c: a.c + b.c
    }), { kcal: 0, p: 0, f: 0, c: 0 });
    document.getElementById('recipe-total-kcal').textContent = tot.kcal.toFixed(0) + ' kcal';
    document.getElementById('recipe-total-p').textContent = tot.p.toFixed(1) + 'g';
    document.getElementById('recipe-total-f').textContent = tot.f.toFixed(1) + 'g';
    document.getElementById('recipe-total-c').textContent = tot.c.toFixed(1) + 'g';
  }

  function saveRecipe() {
    const name = document.getElementById('recipe-name').value.trim();
    if (!name) { toast('料理名を入力してください'); return; }
    if (!recipeIngredients.length) { toast('食材を追加してください'); return; }

    const tot = calcTotal(recipeIngredients);
    const recipe = {
      id: uid(), name,
      ingredients: [...recipeIngredients],
      kcal: tot.kcal, p: tot.p, f: tot.f, c: tot.c,
    };
    recipes.push(recipe);
    store.set('recipes', recipes);
    recipeIngredients = [];
    document.getElementById('recipe-name').value = '';
    renderRecipeIngredients();
    renderSavedRecipes();
    toast('料理を保存しました！');
  }

  function addRecipeToToday() {
    const name = document.getElementById('recipe-name').value.trim() || '無題の料理';
    if (!recipeIngredients.length) { toast('食材を追加してください'); return; }
    const tot = calcTotal(recipeIngredients);
    openRecipeModal({ id: null, name, ...tot });
  }

  function renderSavedRecipes() {
    const list = document.getElementById('saved-recipe-list');
    if (!recipes.length) {
      list.innerHTML = '<div class="empty-state">保存済みの料理はありません</div>';
      return;
    }
    list.innerHTML = recipes.map(r =>
      `<div class="recipe-item">
        <div class="recipe-item-header">
          <div class="recipe-item-name">${escHtml(r.name)}</div>
          <div class="recipe-actions">
            <button class="btn btn-secondary btn-sm" onclick="App.openRecipeModal(App.getRecipe('${r.id}'))">今日に追加</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteRecipe('${r.id}')">削除</button>
          </div>
        </div>
        <div class="nutrition-row">
          <div class="nutrition-badge"><div class="n-val text-kcal">${Math.round(r.kcal)}</div><div class="n-lbl">kcal</div></div>
          <div class="nutrition-badge"><div class="n-val text-p">${r.p.toFixed(1)}g</div><div class="n-lbl">P</div></div>
          <div class="nutrition-badge"><div class="n-val text-f">${r.f.toFixed(1)}g</div><div class="n-lbl">F</div></div>
          <div class="nutrition-badge"><div class="n-val text-c">${r.c.toFixed(1)}g</div><div class="n-lbl">C</div></div>
        </div>
      </div>`
    ).join('');
  }

  function getRecipe(id) { return recipes.find(r => r.id === id); }

  function deleteRecipe(id) {
    recipes = recipes.filter(r => r.id !== id);
    store.set('recipes', recipes);
    renderSavedRecipes();
    toast('料理を削除しました');
  }

  // ── Recipe modal ──────────────────────────────────────────────
  function openRecipeModal(recipe) {
    modalRecipe = recipe;
    document.getElementById('recipe-modal-info').innerHTML =
      `<div style="font-size:16px;font-weight:700;margin-bottom:8px">${escHtml(recipe.name)}</div>
       <div class="nutrition-row">
         <div class="nutrition-badge"><div class="n-val text-kcal">${Math.round(recipe.kcal)}</div><div class="n-lbl">kcal</div></div>
         <div class="nutrition-badge"><div class="n-val text-p">${recipe.p.toFixed(1)}g</div><div class="n-lbl">P</div></div>
         <div class="nutrition-badge"><div class="n-val text-f">${recipe.f.toFixed(1)}g</div><div class="n-lbl">F</div></div>
         <div class="nutrition-badge"><div class="n-val text-c">${recipe.c.toFixed(1)}g</div><div class="n-lbl">C</div></div>
       </div>`;
    document.getElementById('recipe-add-modal').classList.add('open');
  }

  function closeRecipeModal() {
    document.getElementById('recipe-add-modal').classList.remove('open');
    modalRecipe = null;
  }

  function selectRecipeModalTiming(el) {
    el.closest('.timing-chips').querySelectorAll('.timing-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }

  function confirmAddRecipeToToday() {
    if (!modalRecipe) return;
    const timing = document.querySelector('#recipe-modal-timing-chips .timing-chip.active')?.dataset.val || '朝食';
    addMealEntry({ name: modalRecipe.name, gram: null, timing, ...pick(modalRecipe, ['kcal','p','f','c']) });
    closeRecipeModal();
    toast('今日の食事に追加しました！');
  }

  // ── Add-to-today modal (from search) ──────────────────────────
  function openAddModal(food) {
    modalFood = food;
    document.getElementById('modal-food-info').innerHTML =
      `<div style="font-size:16px;font-weight:700;margin-bottom:4px">${escHtml(food.name)}</div>
       <div style="font-size:12px;color:var(--text2)">100gあたり: ${food.kcal}kcal / P${food.p}g F${food.f}g C${food.c}g</div>`;
    document.getElementById('modal-gram').value = '';
    document.getElementById('modal-calc-display').innerHTML = '';
    document.getElementById('add-modal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('add-modal').classList.remove('open');
    modalFood = null;
  }

  function updateModalCalc() {
    const gram = parseFloat(document.getElementById('modal-gram').value);
    const disp = document.getElementById('modal-calc-display');
    if (!modalFood || !gram || gram <= 0) { disp.innerHTML = ''; return; }
    const ratio = gram / 100;
    disp.innerHTML = `<div class="nutrition-row">
      <div class="nutrition-badge"><div class="n-val text-kcal">${(modalFood.kcal*ratio).toFixed(0)}</div><div class="n-lbl">kcal</div></div>
      <div class="nutrition-badge"><div class="n-val text-p">${(modalFood.p*ratio).toFixed(1)}g</div><div class="n-lbl">P</div></div>
      <div class="nutrition-badge"><div class="n-val text-f">${(modalFood.f*ratio).toFixed(1)}g</div><div class="n-lbl">F</div></div>
      <div class="nutrition-badge"><div class="n-val text-c">${(modalFood.c*ratio).toFixed(1)}g</div><div class="n-lbl">C</div></div>
    </div>`;
  }

  function selectModalTiming(el) {
    el.closest('.timing-chips').querySelectorAll('.timing-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }

  function confirmAddToToday() {
    if (!modalFood) return;
    const gram = parseFloat(document.getElementById('modal-gram').value);
    if (!gram || gram <= 0) { toast('グラム数を入力してください'); return; }
    const timing = document.querySelector('#modal-timing-chips .timing-chip.active')?.dataset.val || '朝食';
    const ratio = gram / 100;
    addMealEntry({
      name: modalFood.name, gram, timing,
      kcal: modalFood.kcal * ratio,
      p: modalFood.p * ratio,
      f: modalFood.f * ratio,
      c: modalFood.c * ratio,
    });
    closeModal();
    toast('今日の食事に追加しました！');
  }

  // ── Search ────────────────────────────────────────────────────
  function searchFoods() {
    const q = document.getElementById('food-search-input').value.trim().toLowerCase();
    const results = document.getElementById('food-search-results');
    const list = q ? foods.filter(f => f.name.toLowerCase().includes(q)) : foods;
    if (!list.length) {
      results.innerHTML = '<div class="empty-state">該当する食品が見つかりません</div>';
      return;
    }
    results.innerHTML = list.map(f =>
      `<div class="search-result-item" onclick="App.openAddModal(App.getFood('${f.id}'))">
        <div>
          <div class="search-result-name">${escHtml(f.name)}</div>
          <div class="search-result-sub">P${f.p}g / F${f.f}g / C${f.c}g</div>
        </div>
        <div class="search-result-right">${f.kcal} kcal</div>
      </div>`
    ).join('');
  }

  function searchRecipes() {
    const q = document.getElementById('recipe-search-input').value.trim().toLowerCase();
    const results = document.getElementById('recipe-search-results');
    const list = q ? recipes.filter(r => r.name.toLowerCase().includes(q)) : recipes;
    if (!list.length) {
      results.innerHTML = '<div class="empty-state">該当する料理が見つかりません</div>';
      return;
    }
    results.innerHTML = list.map(r =>
      `<div class="search-result-item" onclick="App.openRecipeModal(App.getRecipe('${r.id}'))">
        <div>
          <div class="search-result-name">${escHtml(r.name)}</div>
          <div class="search-result-sub">P${r.p.toFixed(1)}g / F${r.f.toFixed(1)}g / C${r.c.toFixed(1)}g</div>
        </div>
        <div class="search-result-right">${Math.round(r.kcal)} kcal</div>
      </div>`
    ).join('');
  }

  function getFood(id) { return foods.find(f => f.id === id); }

  // ── Food registration ─────────────────────────────────────────
  function registerFood() {
    const name = document.getElementById('reg-name').value.trim();
    const kcal = parseFloat(document.getElementById('reg-kcal').value);
    const p    = parseFloat(document.getElementById('reg-p').value);
    const f    = parseFloat(document.getElementById('reg-f').value);
    const c    = parseFloat(document.getElementById('reg-c').value);

    if (!name) { toast('食品名を入力してください'); return; }
    if (isNaN(kcal) || isNaN(p) || isNaN(f) || isNaN(c)) { toast('栄養素を入力してください'); return; }

    const food = { id: uid(), name, kcal, p, f, c };
    foods.push(food);
    store.set('foods', foods);
    populateFoodSelects();
    renderFoodMasterList();

    ['reg-name','reg-kcal','reg-p','reg-f','reg-c'].forEach(id => document.getElementById(id).value = '');
    toast('食品を登録しました！');
  }

  function renderFoodMasterList() {
    const list = document.getElementById('food-master-list');
    if (!foods.length) { list.innerHTML = '<div class="empty-state">登録済み食品はありません</div>'; return; }
    list.innerHTML = foods.map(f =>
      `<div class="meal-item" style="background:var(--bg2)">
        <div>
          <div class="meal-item-name">${escHtml(f.name)}</div>
          <div class="meal-item-sub">100g: P${f.p}g F${f.f}g C${f.c}g</div>
        </div>
        <div class="meal-item-right">
          <div class="meal-item-kcal">${f.kcal} kcal</div>
          <button class="delete-btn" onclick="App.deleteFood('${f.id}')">×</button>
        </div>
      </div>`
    ).join('');
  }

  function deleteFood(id) {
    foods = foods.filter(f => f.id !== id);
    store.set('foods', foods);
    populateFoodSelects();
    renderFoodMasterList();
    toast('削除しました');
  }

  // ── Trend charts ──────────────────────────────────────────────
  function setTrendPeriod(days, btn) {
    trendPeriod = days;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTrendCharts();
  }

  function saveDailySummary() {
    const meals = getTodayMeals();
    const tot = meals.reduce((a, m) => ({
      kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c
    }), { kcal: 0, p: 0, f: 0, c: 0 });
    const summaries = store.get('daily_summaries', {});
    summaries[todayKey()] = tot;
    store.set('daily_summaries', summaries);
  }

  function renderTrendCharts() {
    const summaries = store.get('daily_summaries', {});
    const labels = [];
    const kcalData = [];
    const pData = [], fData = [], cData = [];

    for (let i = trendPeriod - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const short = `${d.getMonth()+1}/${d.getDate()}`;
      labels.push(short);
      const s = summaries[key] || { kcal: 0, p: 0, f: 0, c: 0 };
      kcalData.push(Math.round(s.kcal));
      pData.push(parseFloat(s.p.toFixed(1)));
      fData.push(parseFloat(s.f.toFixed(1)));
      cData.push(parseFloat(s.c.toFixed(1)));
    }

    const chartDefaults = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#aaa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { color: '#2e2e2e' } },
        y: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { color: '#2e2e2e' } }
      }
    };

    // Kcal chart
    if (kcalChart) kcalChart.destroy();
    kcalChart = new Chart(document.getElementById('trend-kcal-chart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'カロリー', data: kcalData,
          backgroundColor: 'rgba(251,191,36,0.6)', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 4,
        }, {
          label: '目標', data: Array(labels.length).fill(GOALS.kcal),
          type: 'line', borderColor: '#4ade80', borderWidth: 1.5, borderDash: [4,4], pointRadius: 0,
        }]
      },
      options: { ...chartDefaults }
    });

    // PFC chart
    if (pfcChart) pfcChart.destroy();
    pfcChart = new Chart(document.getElementById('trend-pfc-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'タンパク質', data: pData, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', tension: 0.3, fill: false, pointRadius: 3 },
          { label: '脂質', data: fData, borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', tension: 0.3, fill: false, pointRadius: 3 },
          { label: '炭水化物', data: cData, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)', tension: 0.3, fill: false, pointRadius: 3 },
        ]
      },
      options: { ...chartDefaults }
    });

    // Averages
    const nonZero = kcalData.filter(k => k > 0);
    if (nonZero.length) {
      const n = nonZero.length;
      const sumP = pData.reduce((a,b)=>a+b,0), sumF = fData.reduce((a,b)=>a+b,0), sumC = cData.reduce((a,b)=>a+b,0);
      const sumK = kcalData.reduce((a,b)=>a+b,0);
      document.getElementById('avg-kcal').textContent = Math.round(sumK/n) + ' kcal';
      document.getElementById('avg-p').textContent = (sumP/n).toFixed(1) + 'g';
      document.getElementById('avg-f').textContent = (sumF/n).toFixed(1) + 'g';
      document.getElementById('avg-c').textContent = (sumC/n).toFixed(1) + 'g';
    } else {
      ['avg-kcal','avg-p','avg-f','avg-c'].forEach(id => document.getElementById(id).textContent = '-');
    }
  }

  // ── AI Chat ───────────────────────────────────────────────────
  function initChat() {
    const key = store.get('apikey', '');
    // 未設定のときだけ自動でAPIキー入力欄を開く
    if (!key) {
      document.getElementById('apikey-card').style.display = '';
      document.getElementById('apikey-gear-btn').classList.add('active');
    }
  }

  function toggleApikeyCard() {
    const card = document.getElementById('apikey-card');
    const btn  = document.getElementById('apikey-gear-btn');
    const isHidden = card.style.display === 'none' || card.style.display === '';
    card.style.display = isHidden ? '' : 'none';
    btn.classList.toggle('active', isHidden);
    if (isHidden) {
      const key = store.get('apikey', '');
      document.getElementById('apikey-input').value = key;
      document.getElementById('apikey-input').focus();
    }
  }

  function saveApiKey() {
    const key = document.getElementById('apikey-input').value.trim();
    if (!key.startsWith('sk-ant-')) {
      toast('APIキーが正しくありません（sk-ant- から始まります）');
      return;
    }
    store.set('apikey', key);
    document.getElementById('apikey-card').style.display = 'none';
    document.getElementById('apikey-gear-btn').classList.remove('active');
    toast('APIキーを保存しました');
  }

  function buildSystemPrompt() {
    const meals = getTodayMeals();
    const tot = meals.reduce((a, m) => ({
      kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c
    }), { kcal: 0, p: 0, f: 0, c: 0 });

    const pctKcal = ((tot.kcal / GOALS.kcal) * 100).toFixed(0);
    const pctP    = ((tot.p    / GOALS.p)    * 100).toFixed(0);
    const pctF    = ((tot.f    / GOALS.f)    * 100).toFixed(0);
    const pctC    = ((tot.c    / GOALS.c)    * 100).toFixed(0);

    const mealLines = meals.length
      ? meals.map(m =>
          `  - ${m.timing}：${m.name}${m.gram ? `（${m.gram}g）` : ''} → ${Math.round(m.kcal)}kcal / P${m.p.toFixed(1)}g F${m.f.toFixed(1)}g C${m.c.toFixed(1)}g`
        ).join('\n')
      : '  （まだ記録なし）';

    return `あなたは栄養アドバイザーです。ユーザーの今日の食事データをもとに、具体的で実践的なアドバイスをしてください。
回答は日本語で、親しみやすく簡潔に。箇条書きや強調を適度に使って読みやすくしてください。

## 今日の食事データ（${todayKey()}）

### 目標値
- カロリー: ${GOALS.kcal} kcal
- タンパク質: ${GOALS.p}g
- 脂質: ${GOALS.f}g
- 炭水化物: ${GOALS.c}g

### 現在の摂取量
- カロリー: ${Math.round(tot.kcal)} kcal（目標の${pctKcal}%）
- タンパク質: ${tot.p.toFixed(1)}g（目標の${pctP}%）
- 脂質: ${tot.f.toFixed(1)}g（目標の${pctF}%）
- 炭水化物: ${tot.c.toFixed(1)}g（目標の${pctC}%）

### 食事記録
${mealLines}`;
  }

  async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || chatStreaming) return;
    input.value = '';
    input.style.height = 'auto';
    await sendChatMessage(msg);
  }

  async function sendQuick(msg) {
    if (chatStreaming) return;
    await sendChatMessage(msg);
  }

  async function sendChatMessage(userMsg) {
    const apiKey = store.get('apikey', '');
    if (!apiKey) {
      toast('APIキーを設定してください');
      toggleApikeyCard();
      return;
    }

    // Hide quick prompts after first message
    const qp = document.getElementById('quick-prompts');
    if (qp) qp.style.display = 'none';

    chatHistory.push({ role: 'user', content: userMsg });
    chatHistory.push({ role: 'assistant', content: '', streaming: true });
    chatStreaming = true;
    setChatSendDisabled(true);
    renderChatHistory();
    scrollChatToBottom();

    try {
      const messages = chatHistory
        .slice(0, -1)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: buildSystemPrompt(),
          messages,
          stream: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const last = () => chatHistory[chatHistory.length - 1];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              last().content += ev.delta.text;
              updateLastBubble(last().content, true);
              scrollChatToBottom();
            }
          } catch {}
        }
      }

      last().streaming = false;
      updateLastBubble(last().content, false);
    } catch (err) {
      const last = chatHistory[chatHistory.length - 1];
      last.content = `エラー: ${err.message}`;
      last.streaming = false;
      last.error = true;
      updateLastBubble(last.content, false, true);
    } finally {
      chatStreaming = false;
      setChatSendDisabled(false);
      scrollChatToBottom();
    }
  }

  function renderChatHistory() {
    const container = document.getElementById('chat-messages');
    if (!chatHistory.length) {
      container.innerHTML = `<div class="chat-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:8px"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <div>上のボタンから質問するか、<br>自由にメッセージを入力してください</div>
      </div>`;
      return;
    }
    container.innerHTML = chatHistory.map((m, i) => {
      const bubbleCls = `chat-bubble${m.streaming ? ' streaming' : ''}${m.error ? ' chat-error' : ''}`;
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      return `<div class="chat-msg ${m.role}" data-idx="${i}">
        <div class="${bubbleCls}">${escHtml(m.content)}</div>
        ${!m.streaming ? `<div class="chat-time">${time}</div>` : ''}
      </div>`;
    }).join('');
  }

  function updateLastBubble(content, isStreaming, isError = false) {
    const container = document.getElementById('chat-messages');
    const lastEl = container.querySelector('.chat-msg:last-child .chat-bubble');
    if (!lastEl) return;
    lastEl.textContent = content;
    lastEl.className = `chat-bubble${isStreaming ? ' streaming' : ''}${isError ? ' chat-error' : ''}`;
  }

  function clearChat() {
    chatHistory = [];
    const qp = document.getElementById('quick-prompts');
    if (qp) qp.style.display = '';
    renderChatHistory();
  }

  function scrollChatToBottom() {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function setChatSendDisabled(disabled) {
    const btn = document.getElementById('chat-send-btn');
    if (btn) btn.disabled = disabled;
  }

  function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  }

  // ── Utilities ─────────────────────────────────────────────────
  function calcTotal(items) {
    return items.reduce((a, b) => ({ kcal: a.kcal+b.kcal, p: a.p+b.p, f: a.f+b.f, c: a.c+b.c }), {kcal:0,p:0,f:0,c:0});
  }

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function pick(obj, keys) {
    return Object.fromEntries(keys.map(k => [k, obj[k]]));
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // Close modals on overlay click
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('add-modal')) closeModal();
  });
  document.getElementById('recipe-add-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('recipe-add-modal')) closeRecipeModal();
  });

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);

  return {
    switchTab, switchSubTab,
    selectTiming, recordSingle, updateSingleCalc,
    addRecipeIngredient, removeRecipeIngredient, saveRecipe, addRecipeToToday, getRecipe, deleteRecipe,
    openAddModal, closeModal, updateModalCalc, selectModalTiming, confirmAddToToday,
    openRecipeModal, closeRecipeModal, selectRecipeModalTiming, confirmAddRecipeToToday,
    searchFoods, searchRecipes, getFood,
    registerFood, deleteFood,
    deleteMeal,
    setTrendPeriod,
    toggleApikeyCard, saveApiKey,
    sendChat, sendQuick, clearChat,
    autoResizeTextarea, handleChatKey,
  };
})();
