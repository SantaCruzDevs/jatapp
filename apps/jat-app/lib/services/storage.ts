import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { updateProfile } from './users';

const BUCKET_NAME = 'avatars';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates file type and size.
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Formato de imagen no soportado. Por favor suba una imagen JPG, PNG o WEBP.',
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'El archivo excede el tamaño máximo permitido (2 MB).',
    };
  }
  return { valid: true };
}

/**
 * Normalizes an image File into a WebP Blob with maximum 500x500 dimensions.
 */
export async function convertImageToWebp(file: File, maxSize = 500): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo inicializar el contexto del canvas'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Falló la conversión de la imagen a WebP'));
          }
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen seleccionada.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Normalizes and uploads a user profile avatar to Supabase Storage at avatars/{userId}/profile.webp,
 * then updates public.profiles.avatar_url with a cache-busting timestamp.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const webpBlob = await convertImageToWebp(file);
  const filePath = `${userId}/profile.webp`;

  const supabase = createBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, webpBlob, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading avatar to storage:', uploadError);
    throw new Error(`Error al subir la foto de perfil: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl;
  const avatarUrlWithCacheBuster = `${publicUrl}?v=${Date.now()}`;

  // Update profiles table
  await updateProfile(userId, { avatar_url: avatarUrlWithCacheBuster });

  return avatarUrlWithCacheBuster;
}

/**
 * Removes the avatar for userId from avatars bucket and resets profile avatar_url to null.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const supabase = createBrowserClient();
  const filePath = `${userId}/profile.webp`;

  const { error: deleteStorageError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (deleteStorageError) {
    console.warn('Warning: Storage removal error (file may not exist):', deleteStorageError.message);
  }

  // Reset profiles.avatar_url to null
  await updateProfile(userId, { avatar_url: null });
}
