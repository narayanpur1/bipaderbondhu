const SUPABASE_URL = "https://ftmzoyjspqtvfphjubql.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0bXpveWpzcHF0dmZwaGp1YnFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MjA2MjAsImV4cCI6MjA3MTE5NjYyMH0.nZDNlBSKF9vH37vT-TG_8lHhC9D4fcLbKWYa_St8Gyw";
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let isAdmin = false;
const ADMIN_EMAILS = ['narayanpurbipaderbondhu@gmail.com'];
let currentZoom = 1;
let showAllNotices = false;
let isLoadingPosts = false;
let authInitialized = false;

function formatDate(dateString) {
  const date = new Date(dateString);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function checkAdmin() {
  isAdmin = currentUser && ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-content').forEach(c => c.classList.remove('active'));
  if (tab === 'user') {
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.getElementById('userAuthContent').classList.add('active');
  } else {
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
    document.getElementById('adminAuthContent').classList.add('active');
  }
}

function updateAuthUI() {
  const authSection = document.getElementById('authSection');
  const authSectionMobile = document.getElementById('authSectionMobile');
  let html = '';
  if (currentUser) {
    const displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    const avatarUrl = currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=06b6d4&color=fff`;
    html = `
      <div class="flex items-center space-x-3 flex-wrap">
        <img src="${avatarUrl}" alt="Profile" class="user-avatar w-10 h-10 border-2 border-white">
        <span class="text-white font-medium hidden lg:inline">${displayName}</span>
        ${isAdmin ? `
          <button onclick="openModal('postModal')" class="btn-secondary text-sm py-2 px-4">
            <i class="fas fa-plus mr-1"></i>Post
          </button>
          <button onclick="openModal('noticeModal')" class="btn-danger text-sm py-2 px-4">
            <i class="fas fa-exclamation-triangle mr-1"></i>Notice
          </button>
        ` : ''}
        <button onclick="signOut()" class="text-white hover:text-red-300 transition">
          <i class="fas fa-sign-out-alt text-xl"></i>
        </button>
      </div>
    `;
  } else {
    html = `<button onclick="openModal('loginModal')" class="btn-primary"><i class="fas fa-sign-in-alt mr-2"></i>Sign In</button>`;
  }
  authSection.innerHTML = html;
  if (authSectionMobile) authSectionMobile.innerHTML = html;
}

async function signInWithGoogle() {
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://narayanpur1.github.io/bipaderbondhu/' }
    });
    if (error) throw error;
  } catch (error) {
    console.error('Google sign in error:', error);
    alert('⚠️ Google Sign-In not available. This must be configured in the Supabase dashboard.');
  }
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    document.getElementById('adminLoginForm').reset();
    alert('✅ Signed in successfully!');
    // Don't manually call loadPosts here - onAuthStateChange will handle it
  } catch (error) {
    console.error('Login error:', error);
    alert('❌ Invalid credentials.');
  }
});

async function signOut() {
  if (!confirm('Are you sure you want to sign out?')) return;
  
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    
    // Manually update UI immediately for better UX
    currentUser = null;
    isAdmin = false;
    updateAuthUI();
    
    alert('✅ Signed out!');
    
    // Reload content
    await Promise.all([
      loadPosts(),
      loadNotices(),
      loadStats()
    ]);
  } catch (error) {
    console.error('Sign out error:', error);
    alert('❌ Error signing out');
  }
}

async function loadStats() {
  try {
    const [postsResult, likesResult, commentsResult] = await Promise.all([
      supabaseClient.from('gallery_photos').select('*', { count: 'exact', head: true }),
      supabaseClient.from('post_likes').select('*', { count: 'exact', head: true }),
      supabaseClient.from('post_comments').select('*', { count: 'exact', head: true })
    ]);
    
    document.getElementById('totalPosts').textContent = postsResult.count || 0;
    document.getElementById('totalLikes').textContent = likesResult.count || 0;
    document.getElementById('totalComments').textContent = commentsResult.count || 0;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function toggleLike(postId) {
  if (!currentUser) {
    alert('Please sign in to like posts');
    openModal('loginModal');
    return;
  }
  const likeBtn = event.target.closest('.like-btn');
  const likeCountEl = document.getElementById(`likes-${postId}`);
  const wasLiked = likeBtn.classList.contains('liked');
  likeBtn.classList.toggle('liked');
  likeCountEl.textContent = parseInt(likeCountEl.textContent) + (wasLiked ? -1 : 1);
  try {
    const { data: existingLike } = await supabaseClient.from('post_likes').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
    if (existingLike) {
      const { error } = await supabaseClient.from('post_likes').delete().eq('id', existingLike.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('post_likes').insert([{ post_id: postId, user_id: currentUser.id }]);
      if (error) throw error;
    }
    loadStats();
  } catch (error) {
    likeBtn.classList.toggle('liked');
    likeCountEl.textContent = parseInt(likeCountEl.textContent) + (wasLiked ? 1 : -1);
    console.error('Error toggling like:', error);
    alert('❌ Error: Could not update like.');
  }
}

async function addComment(event, postId) {
  event.preventDefault();
  if (!currentUser) {
    alert('Please sign in to comment');
    openModal('loginModal');
    return;
  }
  const content = event.target.comment.value.trim();
  if (!content) return;
  const displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
  const avatarUrl = currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=06b6d4&color=fff`;
  const commentsList = document.getElementById(`comments-list-${postId}`);
  const commentCountEl = document.getElementById(`comments-${postId}`);
  const form = event.target;
  const commentHTML = `
    <div class="comment-item">
      <div class="flex items-start space-x-3">
        <img src="${avatarUrl}" alt="User" class="user-avatar w-10 h-10">
        <div class="flex-1">
          <p class="font-semibold text-sm text-cyan-600">${displayName}</p>
          <p class="text-gray-700 mt-1">${content}</p>
          <p class="text-xs text-gray-400 mt-1">Just now</p>
        </div>
      </div>
    </div>
  `;
  if (commentsList.querySelector('p.text-gray-500')) {
    commentsList.innerHTML = commentHTML;
  } else {
    commentsList.insertAdjacentHTML('beforeend', commentHTML);
  }
  const newCommentElement = commentsList.lastElementChild;
  commentCountEl.textContent = parseInt(commentCountEl.textContent) + 1;
  form.reset();
  try {
    const { error } = await supabaseClient.from('post_comments').insert([{
      post_id: postId,
      user_id: currentUser.id,
      user_name: displayName,
      user_avatar: avatarUrl,
      content
    }]);
    if (error) throw error;
    loadStats();
  } catch (error) {
    console.error('Error adding comment:', error);
    alert('❌ Error: Could not post comment.');
    newCommentElement.remove();
    commentCountEl.textContent = parseInt(commentCountEl.textContent) - 1;
    if (commentsList.children.length === 0) {
      commentsList.innerHTML = '<p class="text-gray-500 text-center py-3">No comments yet</p>';
    }
  }
}

function openImageViewer(imageUrl) {
  document.getElementById('viewerImage').src = imageUrl;
  document.getElementById('imageViewer').classList.add('active');
  currentZoom = 1;
  document.getElementById('viewerImage').style.transform = `scale(${currentZoom})`;
}

function closeImageViewer() {
  document.getElementById('imageViewer').classList.remove('active');
  currentZoom = 1;
}

function zoomIn() {
  if (currentZoom < 3) {
    currentZoom += 0.25;
    document.getElementById('viewerImage').style.transform = `scale(${currentZoom})`;
  }
}

function zoomOut() {
  if (currentZoom > 0.5) {
    currentZoom -= 0.25;
    document.getElementById('viewerImage').style.transform = `scale(${currentZoom})`;
  }
}

function resetZoom() {
  currentZoom = 1;
  document.getElementById('viewerImage').style.transform = `scale(${currentZoom})`;
}

async function loadPosts() {
  if (isLoadingPosts) {
    console.log('Already loading posts...');
    return;
  }
  
  isLoadingPosts = true;
  
  try {
    const { data: posts, error } = await supabaseClient.from('gallery_photos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    const container = document.getElementById('postsContainer');
    container.innerHTML = '';
    
    if (!posts || posts.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center text-white text-lg">No posts yet</div>';
      isLoadingPosts = false;
      return;
    }
    
    // Batch fetch all likes and comments for better performance
    const postIds = posts.map(p => p.id);
    const [allLikes, allComments] = await Promise.all([
      supabaseClient.from('post_likes').select('post_id, user_id').in('post_id', postIds),
      supabaseClient.from('post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true })
    ]);
    
    // Group by post_id
    const likesByPost = {};
    const commentsByPost = {};
    
    allLikes.data?.forEach(like => {
      if (!likesByPost[like.post_id]) likesByPost[like.post_id] = [];
      likesByPost[like.post_id].push(like);
    });
    
    allComments.data?.forEach(comment => {
      if (!commentsByPost[comment.post_id]) commentsByPost[comment.post_id] = [];
      commentsByPost[comment.post_id].push(comment);
    });
    
    for (const post of posts) {
      const postLikes = likesByPost[post.id] || [];
      const comments = commentsByPost[post.id] || [];
      const likesCount = postLikes.length;
      const userLiked = currentUser ? postLikes.some(like => like.user_id === currentUser.id) : false;
      
      const postCard = document.createElement('div');
      postCard.className = 'post-card';
      postCard.innerHTML = `
        <img src="${post.image_url}" alt="Post" class="w-full h-64 object-cover" onclick="openImageViewer('${post.image_url}')">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-3">
              <img src="Images/logo.png" alt="Admin" class="user-avatar">
              <div>
                <p class="font-semibold text-lg">Bipader Bondhu</p>
                <p class="text-sm text-gray-500">${formatDate(post.created_at)}</p>
              </div>
            </div>
            ${isAdmin ? `<button onclick="deletePost('${post.id}', '${post.image_url}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash text-xl"></i></button>` : ''}
          </div>
          <p class="text-gray-700 mb-4 text-base leading-relaxed">${post.caption}</p>
          <div class="flex items-center space-x-6 mb-4 pt-4 border-t border-gray-100">
            <button onclick="toggleLike('${post.id}')" class="like-btn flex items-center space-x-2 ${userLiked ? 'liked' : 'text-gray-600'}">
              <i class="fas fa-heart text-2xl"></i>
              <span class="font-semibold" id="likes-${post.id}">${likesCount}</span>
            </button>
            <div class="flex items-center space-x-2 text-gray-600">
              <i class="fas fa-comment text-2xl"></i>
              <span class="font-semibold" id="comments-${post.id}">${comments.length}</span>
            </div>
          </div>
          <div class="comment-section">
            <div id="comments-list-${post.id}" class="space-y-3 mb-4 max-h-60 overflow-y-auto">
              ${comments && comments.length > 0 ? comments.map(comment => `
                <div class="comment-item">
                  <div class="flex items-start space-x-3">
                    <img src="${comment.user_avatar || 'https://ui-avatars.com/api/?name=User&background=06b6d4&color=fff'}" alt="User" class="user-avatar w-10 h-10">
                    <div class="flex-1">
                      <p class="font-semibold text-sm text-cyan-600">${comment.user_name || 'User'}</p>
                      <p class="text-gray-700 mt-1">${comment.content}</p>
                      <p class="text-xs text-gray-400 mt-1">${formatDate(comment.created_at)}</p>
                    </div>
                  </div>
                </div>
              `).join('') : '<p class="text-gray-500 text-center py-3">No comments yet</p>'}
            </div>
            ${currentUser ? `
              <form onsubmit="addComment(event, '${post.id}')" class="flex space-x-3">
                <input type="text" placeholder="Add a comment..." required class="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" name="comment">
                <button type="submit" class="btn-secondary text-sm px-6">Post</button>
              </form>
            ` : '<p class="text-center text-gray-500 py-3"><a href="#" onclick="event.preventDefault(); openModal(\'loginModal\');" class="text-cyan-600 font-semibold">Sign in</a> to comment</p>'}
          </div>
        </div>
      `;
      container.appendChild(postCard);
    }
  } catch (error) {
    console.error('Error loading posts:', error);
    document.getElementById('postsContainer').innerHTML = '<div class="col-span-full text-center text-white text-lg">Error loading posts</div>';
  } finally {
    isLoadingPosts = false;
  }
}

document.getElementById('postForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin) {
    alert('Only admins can create posts');
    return;
  }
  const file = document.getElementById('postImage').files[0];
  const caption = document.getElementById('postCaption').value.trim();
  if (!file || !caption) {
    alert('Please provide image and caption');
    return;
  }
  const submitButton = e.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Posting...';
  try {
    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage.from('gallery').upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data: urlData } = supabaseClient.storage.from('gallery').getPublicUrl(fileName);
    const { error: insertError } = await supabaseClient.from('gallery_photos').insert([
      { image_url: urlData.publicUrl, caption: caption, user_id: currentUser.id }
    ]);
    if (insertError) throw insertError;
    alert('✅ Post created!');
    closeModal('postModal');
    e.target.reset();
    await loadPosts();
    await loadStats();
  } catch (error) {
    console.error('Error creating post:', error);
    alert('❌ Error creating post.');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Post';
  }
});

async function deletePost(postId, imageUrl) {
  if (!isAdmin) return;
  if (!confirm('Are you sure you want to delete this post?')) return;
  try {
    await supabaseClient.from('post_likes').delete().eq('post_id', postId);
    await supabaseClient.from('post_comments').delete().eq('post_id', postId);
    const fileName = imageUrl.split('/').pop();
    await supabaseClient.storage.from('gallery').remove([fileName]);
    const { error } = await supabaseClient.from('gallery_photos').delete().eq('id', postId);
    if (error) throw error;
    alert('✅ Post deleted!');
    await loadPosts();
    await loadStats();
  } catch (error) {
    console.error('Error deleting post:', error);
    alert('❌ Error deleting post.');
  }
}

async function loadNotices() {
  try {
    const { data: notices, error } = await supabaseClient.from('urgent_notices').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('noticesContainer');
    const showAllBtn = document.getElementById('showAllNoticesBtn');
    container.innerHTML = '';
    if (error || !notices || notices.length === 0) {
      container.innerHTML = '<p class="text-center text-white text-lg">No urgent notices</p>';
      showAllBtn.style.display = 'none';
      return;
    }
    if (notices.length > 5) {
      showAllBtn.style.display = 'inline-block';
    } else {
      showAllBtn.style.display = 'none';
    }
    notices.forEach((notice, index) => {
      const noticeCard = document.createElement('div');
      noticeCard.className = 'urgent-notice';
      if (!showAllNotices && index >= 5) {
        noticeCard.classList.add('notice-hidden');
      }
      noticeCard.innerHTML = `
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-3">
              <i class="fas fa-exclamation-triangle text-4xl"></i>
              <h3 class="text-3xl font-bold">${notice.title}</h3>
            </div>
            <p class="text-lg mb-3 leading-relaxed">${notice.content}</p>
            <p class="text-sm opacity-75">Posted on ${formatDate(notice.created_at)}</p>
          </div>
          ${isAdmin ? `<button onclick="deleteNotice('${notice.id}')" class="text-white hover:text-red-200 ml-4"><i class="fas fa-trash text-2xl"></i></button>` : ''}
        </div>
      `;
      container.appendChild(noticeCard);
    });
  } catch (error) {
    console.error('Error loading notices:', error);
  }
}

document.getElementById('showAllNoticesBtn').addEventListener('click', () => {
  showAllNotices = !showAllNotices;
  const hiddenNotices = document.querySelectorAll('.notice-hidden');
  const btn = document.getElementById('showAllNoticesBtn');
  if (showAllNotices) {
    hiddenNotices.forEach(notice => notice.classList.remove('notice-hidden'));
    btn.textContent = 'Show Less Notices';
  } else {
    hiddenNotices.forEach(notice => notice.classList.add('notice-hidden'));
    btn.textContent = 'Show All Notices';
  }
});

document.getElementById('noticeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin) {
    alert('Only admins can create notices');
    return;
  }
  const title = document.getElementById('noticeTitle').value.trim();
  const content = document.getElementById('noticeContent').value.trim();
  if (!title || !content) {
    alert('Please fill all fields');
    return;
  }
  const submitButton = e.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Posting...';
  try {
    const { error } = await supabaseClient.from('urgent_notices').insert([{ title, content, user_id: currentUser.id }]);
    if (error) throw error;
    alert('✅ Notice posted!');
    closeModal('noticeModal');
    e.target.reset();
    await loadNotices();
  } catch (error) {
    console.error('Error creating notice:', error);
    alert('❌ Error creating notice.');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Post Notice';
  }
});

async function deleteNotice(noticeId) {
  if (!isAdmin) return;
  if (!confirm('Delete this notice?')) return;
  try {
    const { error } = await supabaseClient.from('urgent_notices').delete().eq('id', noticeId);
    if (error) throw error;
    alert('✅ Notice deleted!');
    await loadNotices();
  } catch (error) {
    console.error('Error deleting notice:', error);
    alert('❌ Error deleting notice.');
  }
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
  document.getElementById('mobileMenu').classList.toggle('hidden');
});

document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  alert('Thank you for your message!');
  e.target.reset();
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('mobileMenu')?.classList.add('hidden');
    }
  });
});

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth event:', event);
  
  if (event === 'SIGNED_IN' && session) {
    currentUser = session.user;
    checkAdmin();
    updateAuthUI();
    closeModal('loginModal');
    
    if (authInitialized) {
      // Only reload if not initial load
      await loadPosts();
      await loadNotices();
      await loadStats();
    }
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    isAdmin = false;
    updateAuthUI();
    await loadPosts();
    await loadNotices();
  }
});

async function initApp() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      checkAdmin();
    }
    updateAuthUI();
    
    // Load content in parallel
    await Promise.all([
      loadPosts(),
      loadNotices(),
      loadStats()
    ]);
    
    authInitialized = true;
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

window.addEventListener('DOMContentLoaded', initApp);



/* -------------------------------------------------------------
   ✅ FIX: Ensure comment box + post button show & work on mobile
   Works even if HTML/CSS missed or JS loaded late.
------------------------------------------------------------- */
window.addEventListener("load", async () => {
  // --- 1️⃣ Create or show fallback comment box if missing ---
  let existing = document.querySelector(".comment-section");
  if (!existing) {
    const section = document.createElement("div");
    section.className = "comment-section";
    section.innerHTML = `
      <textarea id="comment-box" placeholder="Write a comment..." 
        style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;
        margin-top:10px;font-size:15px;"></textarea>
      <button id="submit-comment" 
        style="margin-top:10px;width:100%;padding:10px;background:#007bff;
        color:white;border:none;border-radius:6px;font-weight:600;">
        Post Comment
      </button>
    `;
    document.body.appendChild(section);
  }

  // --- 2️⃣ Force show & fix layout for all comment UI ---
  const style = document.createElement("style");
  style.textContent = `
    #comment-box, #submit-comment, .comment-section {
      display:block !important;
      visibility:visible !important;
      opacity:1 !important;
      height:auto !important;
      width:100% !important;
      overflow:visible !important;
      z-index:9999 !important;
    }
    @media (max-width:768px){
      .comment-section{padding:10px;position:relative;}
    }
  `;
  document.head.appendChild(style);

  // --- 3️⃣ Handle comment post (Supabase logic or fallback) ---
  const commentBtn = document.getElementById("submit-comment");
  const commentBox = document.getElementById("comment-box");

  if (commentBtn && commentBox) {
    commentBtn.addEventListener("click", async () => {
      const commentText = commentBox.value.trim();
      if (!commentText) return alert("Please write something first!");

      // ✅ Replace with your Supabase table name if needed
      try {
        const { data, error } = await supabase
          .from("comments")
          .insert([{ comment: commentText }]);

        if (error) {
          console.error(error);
          alert("❌ Failed to post comment.");
        } else {
          commentBox.value = "";
          alert("✅ Comment posted successfully!");
        }
      } catch (err) {
        console.error(err);
        alert("⚠️ Offline or Supabase not reachable.");
      }
    });
  }
});



