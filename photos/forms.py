from django import forms
from django.core.files.uploadedfile import InMemoryUploadedFile
from io import BytesIO
import os

from PIL import Image, ImageOps, ImageFile, UnidentifiedImageError

from .models import Photo

# 壊れかけ画像で落ちにくくする保険
ImageFile.LOAD_TRUNCATED_IMAGES = True

MAX_UPLOAD_MB = 10
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# 例: 50MP（デカすぎる画像だけ弾く）
MAX_TOTAL_PIXELS = 50_000_000


class LoginForm(forms.Form):
    """参加者ログイン用フォーム（名前入力）"""
    name = forms.CharField(
        label="名前",
        max_length=20,
        widget=forms.TextInput(attrs={
            "placeholder": "名前",
            "class": "auth-input",
            "autocomplete": "nickname",
        })
    )

class PhotoForm(forms.ModelForm):
    class Meta:
        model = Photo
        fields = ["image", "comment"]
        labels = {
            "image": "写真",
            "comment": "コメント（任意）",
        }
        widgets = {
            "comment": forms.Textarea(attrs={
                "class": "comment-area",
                "rows": 6,
                "placeholder": "ひとことどうぞ（任意）",
            })
        }

    def clean_image(self):
        img = self.cleaned_data.get("image")
        if not img:
            return img

        # 元ファイルのサイズ制限
        if img.size > MAX_UPLOAD_BYTES:
            raise forms.ValidationError(
                f"画像サイズが大きすぎます（最大 {MAX_UPLOAD_MB}MB）。"
                "大きい場合はスクショしてから投稿してね。"
            )

        try:
            img.seek(0)

            # 画像として開けるか
            with Image.open(img) as im:
                # EXIF回転を考慮して長辺を計算
                try:
                    im.seek(0)
                except Exception:
                    pass

                # 先にEXIF回転を焼き込み
                im = ImageOps.exif_transpose(im)

                # デコードして破損も検知
                im.load()

                # 解像度チェック
                w, h = im.size
                if w * h > MAX_TOTAL_PIXELS:
                    raise forms.ValidationError("画像の解像度が大きすぎます（別の画像で試してね）")

                # 透過持ち（PNG等）は白背景に合成してからJPEG化
                if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                    im = im.convert("RGBA")
                    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
                    im = Image.alpha_composite(bg, im).convert("RGB")
                elif im.mode != "RGB":
                    im = im.convert("RGB")

                #全部JPEGに統一して保存
                buf = BytesIO()
                im.save(buf, format="JPEG", quality=92)
                buf.seek(0)

            new_size = buf.getbuffer().nbytes
            if new_size > MAX_UPLOAD_BYTES:
                raise forms.ValidationError(
                    f"変換後の画像サイズが大きすぎます（最大 {MAX_UPLOAD_MB}MB）。"
                    "スクショしてから投稿してね。"
                )

            new_name = os.path.splitext(getattr(img, "name", "photo"))[0] + ".jpg"

            return InMemoryUploadedFile(
                file=buf,
                field_name="image",
                name=new_name,
                content_type="image/jpeg",
                size=new_size,
                charset=None,
            )

        except UnidentifiedImageError:
            raise forms.ValidationError("画像ファイルとして認識できません（未対応形式の可能性）")
        except forms.ValidationError:
            raise
        except Exception as e:
            ext = (os.path.splitext(getattr(img, "name", ""))[1] or "").lower()
            ct = getattr(img, "content_type", "unknown")
            raise forms.ValidationError(
                f"画像処理で失敗: {type(e).__name__}: {e} / "
                f"name={getattr(img,'name','')} ext={ext} ct={ct} size={getattr(img,'size','?')}"
            )
        finally:
            try:
                img.seek(0)
            except Exception:
                pass


class AdminLoginForm(forms.Form):
    """管理者ログイン（パスワードのみ）"""
    password = forms.CharField(
        label="管理者パスワード",
        widget=forms.PasswordInput(attrs={
            "placeholder": "管理者パスワード",
            "class": "auth-input",
            "autocomplete": "current-password",
        })
    )
