"""
Restores objects deleted by the accidental `aws s3 sync --delete`.
For each delete marker where IsLatest=True, deletes the marker so the
previous version becomes current again.

Run with: python restore_deleted.py
"""
import boto3

BUCKET = 'bunch-o-taylors'

s3 = boto3.client('s3', region_name='us-east-1')

paginator = s3.get_paginator('list_object_versions')
restored = 0
skipped = 0

for page in paginator.paginate(Bucket=BUCKET):
    for marker in page.get('DeleteMarkers', []):
        if marker['IsLatest']:
            s3.delete_object(
                Bucket=BUCKET,
                Key=marker['Key'],
                VersionId=marker['VersionId']
            )
            print(f"Restored: {marker['Key']}")
            restored += 1
        else:
            skipped += 1

print(f"\nDone. {restored} objects restored, {skipped} older delete markers left untouched.")
