import io
import os
import logging
from PIL import Image, ImageOps

from django.db import models
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)


class EventPassword(models.Model):
    """参加者共通のパスワード（合言葉）"""
    password = models.CharField('合言葉', max_length=50)

    def __str__(self):
        return self.password


class Photo(models.Model):
    name = models.CharField('ニックネーム', max_length=30)
    image = models.ImageField('写真', upload_to='photos/')
    comment = models.CharField('コメント', max_length=100, blank=True)
    session_key = models.CharField('セッションID', max_length=40)
    created_at = models.DateTimeField('投稿日時', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # 画像がある＆まだ圧縮してない時だけ圧縮
        if self.image and not kwargs.pop("skip_compress", False):
            try:
                self._compress_image_inplace()
            except Exception as e:
                logger.exception("Image compress failed: %s", e)

        super().save(*args, **kwargs)

    def _compress_image_inplace(self):
        MAX_LONG_EDGE = 1600
        JPEG_QUALITY = 85
        # これ超えるなら圧縮したい（好みで調整）
        TARGET_BYTES = 2 * 1024 * 1024  # 2MB

        # 既存画像の更新で、画像が変わってないならスキップしたい場合
        if self.pk:
            old_name = type(self).objects.filter(pk=self.pk).values_list("image", flat=True).first()
            if old_name == self.image.name:
                return

        # storage問わず読めるように open
        self.image.open("rb")
        uploaded_name = self.image.name
        original_size = getattr(self.image, "size", None)

        im = Image.open(self.image)
        im = ImageOps.exif_transpose(im)

        # JPEG化するのでRGBへ
        if im.mode in ("RGBA", "P"):
            im = im.convert("RGB")
        else:
            im = im.convert("RGB")

        w, h = im.size
        long_edge = max(w, h)

        # リサイズが必要なら縮める
        if long_edge > MAX_LONG_EDGE:
            scale = MAX_LONG_EDGE / float(long_edge)
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            im = im.resize((new_w, new_h), Image.LANCZOS)

        # JPEGに書き出し
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        buf.seek(0)
        out_bytes = buf.getbuffer().nbytes

        # 「サイズが小さくならないなら変えない」保険
        if original_size is not None:
            if (long_edge <= MAX_LONG_EDGE) and (original_size <= TARGET_BYTES):
                #軽いなら触らない
                return
            # 圧縮結果が元より大きいならやめる
            if out_bytes >= original_size:
                return

        base, _ext = os.path.splitext(uploaded_name)
        new_name = base + ".jpg"

        # ここが肝：モデル保存前に「差し替え」する（原本を一回保存しない）
        self.image.save(new_name, ContentFile(buf.read()), save=False)



class Like(models.Model):
    """イイネ情報"""
    photo = models.ForeignKey(
        Photo,
        on_delete=models.CASCADE,
        related_name='likes',
    )
    session_key = models.CharField('セッションID', max_length=40)
    created_at = models.DateTimeField('作成日時', auto_now_add=True)

    class Meta:
        # 同じセッションが同じ写真に複数いいねできないようにする
        unique_together = ('photo', 'session_key')

    def __str__(self):
        return f'Like: photo={self.photo_id} - session={self.session_key}'
