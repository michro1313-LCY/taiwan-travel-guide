import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, setDoc, deleteDoc, getDocs, query,
  where, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";

const cfg = window.TRAVEL_GUIDE_CONFIG;
const configured = cfg && !Object.values(cfg.firebase).some(v => String(v).includes("REPLACE")) && !cfg.adminUid.includes("REPLACE");
const $ = id => document.getElementById(id);
const status = message => { $("status").textContent = message || ""; };
const escapeText = value => String(value ?? "");
let auth, db, storage, currentUser = null, posts = [], favoritesOnly = false;

function getFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem("travelFavorites") || "[]")); }
  catch { return new Set(); }
}
function saveFavorites(items) { localStorage.setItem("travelFavorites", JSON.stringify([...items])); }
function isAdmin(user) { return Boolean(user && user.uid === cfg.adminUid); }

function renderPosts() {
  const root = $("posts");
  root.replaceChildren();
  const favorites = getFavorites();
  const visible = favoritesOnly ? posts.filter(p => favorites.has(p.id)) : posts;
  if (!visible.length) {
    const p = document.createElement("p");
    p.textContent = favoritesOnly ? "尚未收藏任何行程。" : "目前尚無公開文章。";
    root.append(p);
    return;
  }
  visible.forEach(post => {
    const node = $("postTemplate").content.cloneNode(true);
    const card = node.querySelector("article");
    const image = node.querySelector("img");
    image.src = post.imageUrl || "";
    image.alt = post.imageUrl ? `${post.title}封面` : "";
    node.querySelector("h3").textContent = escapeText(post.title);
    node.querySelector(".excerpt").textContent = escapeText(post.excerpt);
    node.querySelector(".post-body").textContent = escapeText(post.body);
    const favorite = node.querySelector(".favorite");
    const setFavoriteLabel = () => favorite.textContent = favorites.has(post.id) ? "★ 已收藏" : "☆ 收藏";
    setFavoriteLabel();
    favorite.addEventListener("click", () => {
      favorites.has(post.id) ? favorites.delete(post.id) : favorites.add(post.id);
      saveFavorites(favorites); setFavoriteLabel();
      if (favoritesOnly) renderPosts();
    });
    node.querySelector(".comment").addEventListener("click", () => {
      $("commentPostId").value = post.id;
      $("commentDialog").showModal();
    });
    if (isAdmin(currentUser)) {
      const edit = node.querySelector(".edit");
      const remove = node.querySelector(".delete");
      edit.hidden = remove.hidden = false;
      edit.addEventListener("click", () => startEdit(post));
      remove.addEventListener("click", async () => {
        if (!confirm(`確定刪除「${post.title}」？`)) return;
        await deleteDoc(doc(db, "posts", post.id));
        status("文章已刪除。"); await loadPosts();
      });
    }
    root.append(card);
  });
}

async function loadPosts() {
  if (!configured) return;
  const q = isAdmin(currentUser)
    ? query(collection(db, "posts"), orderBy("updatedAt", "desc"), limit(100))
    : query(collection(db, "posts"), where("published", "==", true), limit(100));
  const snap = await getDocs(q);
  posts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  if (!isAdmin(currentUser)) {
    posts.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  }
  renderPosts();
}

function resetPostForm() { $("postForm").reset(); $("postId").value = ""; $("published").checked = true; }
function startEdit(post) {
  $("postId").value = post.id; $("title").value = post.title || "";
  $("excerpt").value = post.excerpt || ""; $("body").value = post.body || "";
  $("imageUrl").value = post.imageUrl || ""; $("published").checked = Boolean(post.published);
  $("adminPanel").scrollIntoView({ behavior:"smooth" });
}

async function uploadImage(file) {
  if (!file) return $("imageUrl").value.trim();
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("圖片必須小於 10MB，格式限 JPG、PNG 或 WebP。");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = ref(storage, `post-images/${Date.now()}-${safeName}`);
  await uploadBytes(target, file, { contentType:file.type });
  return getDownloadURL(target);
}

$("postForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin(currentUser)) return status("沒有管理權限。");
  try {
    status("正在儲存文章…");
    const imageUrl = await uploadImage($("imageFile").files[0]);
    const data = {
      title:$("title").value.trim(), excerpt:$("excerpt").value.trim(), body:$("body").value.trim(),
      imageUrl, published:$("published").checked, updatedAt:serverTimestamp(), authorUid:currentUser.uid
    };
    const id = $("postId").value;
    if (id) await setDoc(doc(db, "posts", id), data, { merge:true });
    else await addDoc(collection(db, "posts"), { ...data, createdAt:serverTimestamp() });
    resetPostForm(); status("文章已安全儲存。"); await loadPosts();
  } catch (error) { status(`儲存失敗：${error.message}`); }
});

$("commentForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await addDoc(collection(db, "comments"), {
      postId:$("commentPostId").value, name:$("commentName").value.trim(),
      message:$("commentText").value.trim(), status:"pending", createdAt:serverTimestamp()
    });
    $("commentForm").reset(); $("commentDialog").close(); status("留言已送出，待管理員審核。");
  } catch (error) { status(`留言送出失敗：${error.message}`); }
});

async function loadComments() {
  if (!isAdmin(currentUser)) return;
  const snap = await getDocs(query(collection(db, "comments"), where("status", "==", "pending"), limit(100)));
  const root = $("commentQueue"); root.replaceChildren();
  snap.docs.forEach(item => {
    const data = item.data(); const box = document.createElement("div"); box.className = "comment-item";
    const title = document.createElement("strong"); title.textContent = data.name;
    const message = document.createElement("p"); message.textContent = data.message;
    const approve = document.createElement("button"); approve.textContent = "標記已處理";
    approve.addEventListener("click", async () => { await setDoc(item.ref, { status:"reviewed", reviewedAt:serverTimestamp() }, { merge:true }); await loadComments(); });
    const remove = document.createElement("button"); remove.textContent = "刪除"; remove.className = "danger";
    remove.addEventListener("click", async () => { await deleteDoc(item.ref); await loadComments(); });
    const actions = document.createElement("div"); actions.className = "actions"; actions.append(approve, remove);
    box.append(title, message, actions); root.append(box);
  });
  if (!snap.size) root.textContent = "目前沒有待審核留言。";
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("loginForm").reset(); $("loginDialog").close();
  } catch { status("登入失敗，請確認電子郵件與密碼。"); }
});
$("loginButton").addEventListener("click", () => $("loginDialog").showModal());
$("logoutButton").addEventListener("click", () => signOut(auth));
$("closeLogin").addEventListener("click", () => $("loginDialog").close());
$("closeComment").addEventListener("click", () => $("commentDialog").close());
$("cancelEdit").addEventListener("click", resetPostForm);
$("refreshComments").addEventListener("click", loadComments);
$("showFavorites").addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  $("showFavorites").textContent = favoritesOnly ? "顯示全部" : "只看收藏";
  renderPosts();
});

if (!configured) {
  status("網站驗證尚未設定。請依 README.md 填入 Firebase 專案資料。");
  renderPosts();
} else {
  const app = initializeApp(cfg.firebase); auth = getAuth(app); db = getFirestore(app); storage = getStorage(app);
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    const admin = isAdmin(user);
    $("adminPanel").hidden = !admin; $("loginButton").hidden = Boolean(user); $("logoutButton").hidden = !user;
    $("adminIdentity").textContent = admin ? user.email : "";
    if (user && !admin) { await signOut(auth); status("此帳號沒有管理權限。"); return; }
    if (admin) { status("管理員已登入。"); await loadComments(); }
    await loadPosts();
  });
}
