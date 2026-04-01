from django.shortcuts import render, redirect, get_object_or_404
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.db.models import Count
from .models import Photo, Like
from .forms import LoginForm, PhotoForm, AdminLoginForm
from django.http import HttpResponseForbidden
from functools import wraps

# ========================================
# QRコード認証（本番用）
# ========================================

def require_qr_ok(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not request.session.get("qr_ok"):
            return redirect("photos:gate")
        return view_func(request, *args, **kwargs)
    return _wrapped


def gate_view(request):
    key = request.GET.get("key", "")

    if key and key == getattr(settings, "EVENT_JOIN_KEY", ""):
        request.session["qr_ok"] = True
        return redirect("photos:login")

    return HttpResponseForbidden("QRからアクセスしてください。")


# ========================================
# ローカル確認用の簡易認証
# ※ 現在は本番に切り替え
# ========================================
'''
def require_qr_ok(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        return view_func(request, *args, **kwargs)
    return _wrapped

# ローカル確認用：gate に来てもそのままログインへ
def gate_view(request):
    return redirect("photos:login")
'''


def get_session_key(request):
    """セッションIDを必ず持たせるヘルパー"""
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key

@require_qr_ok
def login_view(request):
    """QR通過後：名前だけでログイン / QR無しはここに来れない"""
    if request.method == 'POST':
        # QR通過済みなら「名前だけ」でログインさせる
        name = (request.POST.get("name") or "").strip()
        if name:
            get_session_key(request)
            request.session['user_name'] = name
            request.session['is_user_logged_in'] = True
            return redirect('photos:home')

        # 名前未入力の場合はエラーを付与して再表示
        form = LoginForm(request.POST)
        form.add_error('name', '名前を入れてね！')
    else:
        form = LoginForm()

    return render(request, 'photos/login.html', {'form': form})


def logout_view(request):
    '''ログアウト'''
    request.session.flush() 
    return redirect('photos:login')


@require_qr_ok
def home_view(request):
    """ログイン後のメイン画面（投稿＋一覧表示）"""
    if not request.session.get('is_user_logged_in'):
        return redirect('photos:login')

    user_name = request.session.get('user_name', '名無し')
    session_key = get_session_key(request)

    if request.method == 'POST':
        form = PhotoForm(request.POST, request.FILES)
        if form.is_valid():
            photo = form.save(commit=False)
            photo.name = user_name
            photo.session_key = session_key
            photo.save()
            return redirect('photos:home')
    else:
        form = PhotoForm()

    photos = Photo.objects.all().prefetch_related('likes')  # ← likesも一緒に

    # このセッションが「いいね」済みの photo_id をセットで持つ
    liked_photo_ids = set(
        Like.objects.filter(
            session_key=session_key,
            photo__in=photos
        ).values_list('photo_id', flat=True)
    )

    context = {
        'user_name': user_name,
        'form': form,
        'photos': photos,
        'liked_photo_ids': liked_photo_ids,
    }
    return render(request, 'photos/home.html', context)



@require_qr_ok
def upload_photo(request):
    # ログインしてなければ参加者ログインへ
    if not request.session.get('is_user_logged_in'):
        return redirect('photos:login')

    user_name = request.session.get('user_name', '')

    if request.method == 'POST':
        form = PhotoForm(request.POST, request.FILES)
        if form.is_valid():
            photo = form.save(commit=False)
            photo.name = user_name

            # 投稿者識別のためセッションIDを保存
            photo.session_key = get_session_key(request)

            photo.save()
            return redirect('photos:upload_success')
    else:
        form = PhotoForm()

    return render(request, 'photos/upload.html', {
        'user_name': user_name,
        'form': form,
    })



@require_qr_ok
def upload_success_view(request):
    # ログインしてなければ参加者ログインへ
    if not request.session.get('is_user_logged_in'):
        return redirect('photos:login')

    user_name = request.session.get('user_name', '')
    context = {
        'user_name': user_name,
    }
    return render(request, 'photos/success.html', context)



def screen_view(request):
    # 管理者ログインしてなければ管理者ログインへ
    if not admin_login_required(request):
        return redirect('photos:admin_login')

    photos = Photo.objects.all()
    context = {
        'photos': photos,
    }
    return render(request, 'photos/screen.html', context)




def admin_photo_list_view(request):
    """管理者用：投稿写真一覧 + 削除 + 単体ダウンロードリンク"""
    if not admin_login_required(request):
        return redirect('photos:admin_login')

    if request.method == 'POST':
        # 写真削除処理
        photo_id = request.POST.get('delete_photo_id')
        if photo_id:
            photo = get_object_or_404(Photo, id=photo_id)
            # 画像ファイルも一緒に削除
            if photo.image:
                photo.image.delete(save=False)
            photo.delete()
            return redirect('photos:admin_photo_list')

    photos = Photo.objects.all()

    context = {
        'photos': photos,
    }
    return render(request, 'photos/admin_photo_list.html', context)


def admin_login_view(request):
    """管理者ログイン（パスワード1個だけ）"""
    if request.method == 'POST':
        form = AdminLoginForm(request.POST)
        if form.is_valid():
            password = form.cleaned_data['password']
            if password == settings.ADMIN_PASSWORD:
                request.session['is_admin_logged_in'] = True
                return redirect('photos:admin_photo_list')
            else:
                form.add_error('password', 'パスワードが正しくありません。')
    else:
        form = AdminLoginForm()

    return render(request, 'photos/admin_login.html', {'form': form})

def admin_login_required(request):
    """管理者ログインしてなかったら管理者ログインページへ"""
    if not request.session.get('is_admin_logged_in'):
        return False
    return True


def admin_logout_view(request):
    request.session.flush()
    return redirect('photos:admin_login')


@require_qr_ok
@require_POST
def toggle_like_view(request, photo_id):
    """いいねのON/OFFをトグルするAPI（JSON返す）"""
    # ログインしてなかったらエラー返す
    if not request.session.get('is_user_logged_in'):
        return JsonResponse({'error': 'not_logged_in'}, status=403)

    session_key = get_session_key(request)
    photo = get_object_or_404(Photo, id=photo_id)

    like, created = Like.objects.get_or_create(
        photo=photo,
        session_key=session_key,
    )

    if not created:
        # すでにあったら → 削除（いいね解除）
        like.delete()
        liked = False
    else:
        liked = True

    # 現在のいいね数を返す
    like_count = photo.likes.count()

    return JsonResponse({
        'liked': liked,
        'like_count': like_count,
        'photo_id': photo.id,
    })


@require_GET
def screen_photos_api(request):
    after = request.GET.get("after")
    qs = Photo.objects.annotate(like_count=Count("likes")).order_by("id")

    if after and after.isdigit():
        qs = qs.filter(id__gt=int(after))

    photos = []
    for photo in qs:
        photos.append({
            "id": photo.id,
            "name": photo.name,
            "comment": photo.comment or "",
            "like_count": photo.like_count,
            "image_url": photo.image.url if photo.image else "",
        })

    return JsonResponse({"photos": photos}, json_dumps_params={"ensure_ascii": False})
