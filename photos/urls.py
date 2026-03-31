from django.urls import path
from . import views

app_name = 'photos'

urlpatterns = [
    # 参加者用
    path('gate/', views.gate_view, name='gate'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('', views.home_view, name='home'),
    path('upload/', views.upload_photo, name='upload'),
    path('upload/success/', views.upload_success_view, name='upload_success'),
    path('like/<int:photo_id>/', views.toggle_like_view, name='toggle_like'),

    # スクリーン表示用
    path('screen/', views.screen_view, name='screen'),
    path("screen/api/photos/", views.screen_photos_api, name="screen_photos_api"),
    # 管理者用
    path('manage/login/', views.admin_login_view, name='admin_login'),
    path('manage/logout/', views.admin_logout_view, name='admin_logout'),
    path('manage/photos/', views.admin_photo_list_view, name='admin_photo_list'),
]
