from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image

from .models import Like, Photo


def make_test_image(name="test.jpg", size=(20, 20), color="red"):
    buffer = BytesIO()
    image = Image.new("RGB", size, color=color)
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


@override_settings(EVENT_JOIN_KEY="test-event-key")
class QRGateTests(TestCase):
    def test_login_requires_qr_session(self):
        response = self.client.get(reverse("photos:login"))

        self.assertRedirects(
            response,
            reverse("photos:gate"),
            fetch_redirect_response=False,
        )

    def test_gate_with_valid_key_sets_session_and_redirects_to_login(self):
        response = self.client.get(reverse("photos:gate"), {"key": "test-event-key"})

        self.assertRedirects(response, reverse("photos:login"))
        self.assertTrue(self.client.session.get("qr_ok"))


class LoginFlowTests(TestCase):
    def setUp(self):
        session = self.client.session
        session["qr_ok"] = True
        session.save()

    def test_post_name_logs_user_in_and_redirects_home(self):
        response = self.client.post(reverse("photos:login"), {"name": "Taro"})

        self.assertRedirects(response, reverse("photos:home"))
        self.assertEqual(self.client.session.get("user_name"), "Taro")
        self.assertTrue(self.client.session.get("is_user_logged_in"))

    def test_post_empty_name_does_not_log_user_in(self):
        response = self.client.post(reverse("photos:login"), {"name": ""})

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.client.session.get("user_name"))
        self.assertIsNone(self.client.session.get("is_user_logged_in"))


class LikeToggleTests(TestCase):
    def setUp(self):
        session = self.client.session
        session["qr_ok"] = True
        session["is_user_logged_in"] = True
        session["user_name"] = "Taro"
        session.save()
        self.session_key = session.session_key

        self.photo = Photo(
            name="Hanako",
            comment="hello",
            session_key="photo-owner-session",
            image=make_test_image(),
        )
        self.photo.save(skip_compress=True)

    def test_first_post_creates_like(self):
        response = self.client.post(reverse("photos:toggle_like", args=[self.photo.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["liked"], True)
        self.assertEqual(response.json()["like_count"], 1)
        self.assertTrue(
            Like.objects.filter(photo=self.photo, session_key=self.session_key).exists()
        )

    def test_second_post_removes_existing_like(self):
        Like.objects.create(photo=self.photo, session_key=self.session_key)

        response = self.client.post(reverse("photos:toggle_like", args=[self.photo.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["liked"], False)
        self.assertEqual(response.json()["like_count"], 0)
        self.assertFalse(
            Like.objects.filter(photo=self.photo, session_key=self.session_key).exists()
        )

    def test_post_without_login_returns_403_and_does_not_create_like(self):
        session = self.client.session
        session["is_user_logged_in"] = False
        session.save()

        response = self.client.post(reverse("photos:toggle_like", args=[self.photo.id]))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"error": "not_logged_in"})
        self.assertFalse(Like.objects.filter(photo=self.photo).exists())


class AdminAccessTests(TestCase):
    def test_admin_photo_list_requires_admin_login(self):
        response = self.client.get(reverse("photos:admin_photo_list"))

        self.assertRedirects(response, reverse("photos:admin_login"))

    def test_screen_api_requires_admin_login(self):
        response = self.client.get(reverse("photos:screen_photos_api"))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"error": "admin_login_required"})
