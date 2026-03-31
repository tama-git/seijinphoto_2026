from django.contrib import admin
from .models import EventPassword, Photo, Like

@admin.register(EventPassword)
class EventPasswordAdmin(admin.ModelAdmin):
    list_display = ('password',)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'comment')


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ('id', 'photo', 'session_key', 'created_at')
    search_fields = ('session_key',)

